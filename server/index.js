require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { getConfig, setConfig, clearConfig, getSafeConfig } = require('./store');
const { getAccessToken, rcApiFetch } = require('./rcAuth');
const { uploadToSftp, testSftpConnection, fetchAllInsights, runScheduledUpload, startSchedule, stopSchedule, getScheduleStatus, getHistory } = require('./sftp');
const { storeInteraction, getInteractions, normalizePbxRecord, getCount: getInteractionCount } = require('./interactions');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// ─── Admin Auth Middleware ───────────────────────────────────────────────────
// Simple token-based auth: client sends admin password, gets a signed session token
const SESSION_TOKENS = new Map(); // token -> { expires }

function generateSessionToken() {
  return crypto.randomBytes(48).toString('hex');
}

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const session = SESSION_TOKENS.get(token);
  if (!session || session.expires < Date.now()) {
    SESSION_TOKENS.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  next();
}

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of SESSION_TOKENS.entries()) {
    if (session.expires < now) SESSION_TOKENS.delete(token);
  }
}, 60 * 1000);

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword === 'changeme') {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured on server. Set it in environment variables.' });
  }

  // Timing-safe comparison
  const inputBuf = Buffer.from(password || '');
  const expectedBuf = Buffer.from(adminPassword);
  if (inputBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(inputBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateSessionToken();
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  SESSION_TOKENS.set(token, { expires });

  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({ success: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-admin-token'] || req.cookies?.admin_token;
  if (token) SESSION_TOKENS.delete(token);
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const token = req.headers['x-admin-token'] || req.cookies?.admin_token;
  if (!token) return res.json({ authenticated: false });
  const session = SESSION_TOKENS.get(token);
  if (!session || session.expires < Date.now()) {
    SESSION_TOKENS.delete(token);
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true });
});

// ─── Config Routes (protected) ───────────────────────────────────────────────
app.get('/api/config', adminAuth, (req, res) => {
  try {
    res.json(getSafeConfig());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config', adminAuth, (req, res) => {
  try {
    const updates = req.body;
    // Don't allow overwriting with masked values
    for (const key of Object.keys(updates)) {
      if (typeof updates[key] === 'string' && updates[key].startsWith('••••')) {
        delete updates[key];
      }
    }

    // If API credentials are changing, invalidate the cached token
    const credentialKeys = ['rc_client_id', 'rc_client_secret', 'rc_jwt', 'rc_server_url'];
    const isCredentialChange = credentialKeys.some(k => updates[k] !== undefined);
    if (isCredentialChange) {
      updates.rc_access_token = null;
      updates.rc_token_expiry = null;
      console.log('[CONFIG] API credentials changed — cached token cleared');
    }

    setConfig(updates);
    res.json({ success: true, config: getSafeConfig() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear stored webhook interactions (e.g. after switching accounts)
app.delete('/api/interactions', adminAuth, (req, res) => {
  try {
    const fs = require('fs');
    const storePath = path.join(__dirname, '..', 'data', 'interactions.json');
    if (fs.existsSync(storePath)) fs.writeFileSync(storePath, '[]');
    res.json({ success: true, message: 'Stored interactions cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/config', adminAuth, (req, res) => {
  try {
    clearConfig();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RC API Test ─────────────────────────────────────────────────────────────
app.post('/api/rc/test', adminAuth, async (req, res) => {
  try {
    await getAccessToken();
    // Fetch and store the account ID for webhook filtering
    try {
      const acct = await rcApiFetch('/restapi/v1.0/account/~');
      if (acct.id) {
        setConfig({ rc_account_id: String(acct.id) });
        console.log(`[AUTH] Account ID stored: ${acct.id}`);
      }
    } catch {}
    res.json({ success: true, message: 'Successfully authenticated with RingCentral API.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Call Log & Insights Routes (protected) ──────────────────────────────────
// Merged: PBX calls from call log + RCX interactions from webhook store

// Debug endpoint — shows raw API responses to diagnose issues
app.get('/api/debug/calllog', adminAuth, async (req, res) => {
  const results = {};
  const { dateFrom } = req.query;
  const dfrom = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Try account-level call log
  try {
    const params = new URLSearchParams({ view: 'Simple', type: 'Voice', perPage: '10', dateFrom: dfrom });
    const data = await rcApiFetch(`/restapi/v1.0/account/~/call-log?${params}`);
    results.accountCallLog = { status: 'ok', totalRecords: (data.records||[]).length, firstRecord: (data.records||[])[0] || null, hasRecordings: (data.records||[]).filter(r=>r.recording).length };
  } catch (err) {
    results.accountCallLog = { status: 'error', message: err.message };
  }

  // Try account-level with recordingType filter
  try {
    const params = new URLSearchParams({ view: 'Simple', type: 'Voice', recordingType: 'All', perPage: '10', dateFrom: dfrom });
    const data = await rcApiFetch(`/restapi/v1.0/account/~/call-log?${params}`);
    results.accountCallLogWithRecording = { status: 'ok', totalRecords: (data.records||[]).length, hasRecordings: (data.records||[]).filter(r=>r.recording).length };
  } catch (err) {
    results.accountCallLogWithRecording = { status: 'error', message: err.message };
  }

  // Try extension-level call log
  try {
    const params = new URLSearchParams({ view: 'Simple', type: 'Voice', perPage: '10', dateFrom: dfrom });
    const data = await rcApiFetch(`/restapi/v1.0/account/~/extension/~/call-log?${params}`);
    results.extensionCallLog = { status: 'ok', totalRecords: (data.records||[]).length, firstRecord: (data.records||[])[0] || null, hasRecordings: (data.records||[]).filter(r=>r.recording).length };
  } catch (err) {
    results.extensionCallLog = { status: 'error', message: err.message };
  }

  // Try extension-level WITHOUT type filter (maybe these aren't Voice?)
  try {
    const params = new URLSearchParams({ view: 'Simple', perPage: '10', dateFrom: dfrom });
    const data = await rcApiFetch(`/restapi/v1.0/account/~/extension/~/call-log?${params}`);
    results.extensionCallLogNoTypeFilter = { status: 'ok', totalRecords: (data.records||[]).length, types: [...new Set((data.records||[]).map(r=>r.type))], hasRecordings: (data.records||[]).filter(r=>r.recording).length, firstRecord: (data.records||[])[0] || null };
  } catch (err) {
    results.extensionCallLogNoTypeFilter = { status: 'error', message: err.message };
  }

  // Check stored webhook interactions
  results.webhookInteractions = { count: getInteractionCount() };

  res.json(results);
});

app.get('/api/calls', adminAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, perPage } = req.query;
    const dfrom = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dto = dateTo || undefined;

    // 1. Fetch PBX calls — try account-level first, fall back to extension-level
    let pbxRecords = [];
    let callLogSource = 'none';

    // Try account-level call log
    try {
      const params = new URLSearchParams({
        view: 'Simple',
        type: 'Voice',
        recordingType: 'All',
        perPage: perPage || '250',
        dateFrom: dfrom,
      });
      if (dto) params.set('dateTo', dto);

      const data = await rcApiFetch(`/restapi/v1.0/account/~/call-log?${params}`);
      const records = (data.records || []).filter(r => r.recording);
      if (records.length > 0) {
        pbxRecords = records.map(normalizePbxRecord);
        callLogSource = 'account';
        console.log(`[CALLS] Account-level: ${records.length} recorded calls`);
      } else {
        console.log(`[CALLS] Account-level returned ${(data.records||[]).length} calls, ${records.length} with recordings`);
      }
    } catch (err) {
      console.warn('[CALLS] Account-level call log failed:', err.message);
    }

    // Fallback to extension-level if account-level returned nothing
    if (pbxRecords.length === 0) {
      try {
        const params = new URLSearchParams({
          view: 'Simple',
          type: 'Voice',
          recordingType: 'All',
          perPage: perPage || '250',
          dateFrom: dfrom,
        });
        if (dto) params.set('dateTo', dto);

        const data = await rcApiFetch(`/restapi/v1.0/account/~/extension/~/call-log?${params}`);
        const records = (data.records || []).filter(r => r.recording);
        pbxRecords = records.map(normalizePbxRecord);
        callLogSource = 'extension';
        console.log(`[CALLS] Extension-level: ${records.length} recorded calls`);
      } catch (err) {
        console.warn('[CALLS] Extension-level call log also failed:', err.message);
      }
    }

    // 2. Get RCX interactions from webhook store
    const rcxRecords = getInteractions(dfrom, dto);

    // 3. Merge and sort by date descending
    const allRecords = [...pbxRecords, ...rcxRecords];
    allRecords.sort((a, b) => {
      const ta = new Date(a.recordingStartTime || a.creationTime || 0).getTime();
      const tb = new Date(b.recordingStartTime || b.creationTime || 0).getTime();
      return tb - ta;
    });

    res.json({
      records: allRecords,
      total: allRecords.length,
      pbxCount: pbxRecords.length,
      rcxCount: rcxRecords.length,
      callLogSource,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insights — use query param to avoid URL path issues with long RCX IDs
app.get('/api/calls/insights', adminAuth, async (req, res) => {
  try {
    const { recordingId, domain } = req.query;
    if (!recordingId) return res.status(400).json({ error: 'recordingId query param required' });
    const d = domain || 'pbx';
    console.log(`[INSIGHTS] Fetching: domain=${d}, recordingId=${recordingId} (length=${recordingId.length})`);
    const data = await rcApiFetch(
      `/ai/ringsense/v1/public/accounts/~/domains/${d}/records/${recordingId}/insights`
    );
    res.json(data);
  } catch (err) {
    console.error(`[INSIGHTS] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Debug: view stored webhook interactions
app.get('/api/debug/interactions', adminAuth, (req, res) => {
  const interactions = getInteractions();
  res.json({
    count: interactions.length,
    interactions: interactions.slice(0, 20).map(i => ({
      id: i.id,
      sourceRecordId: i.sourceRecordId,
      sourceRecordIdLength: (i.sourceRecordId || '').length,
      domain: i.domain,
      title: i.title,
      recordingStartTime: i.recordingStartTime,
    })),
  });
});

// ─── RingSense Webhook Endpoint (public — RC needs to reach it) ─────────────
// RC sends a validation request first, then event payloads
app.post('/api/webhook/ringsense', express.json(), (req, res) => {
  // Handle RC webhook validation
  const validationToken = req.headers['validation-token'];
  if (validationToken) {
    console.log('[WEBHOOK] Validation request received');
    res.setHeader('Validation-Token', validationToken);
    return res.status(200).end();
  }

  try {
    const event = req.body;
    console.log(`[WEBHOOK] RingSense event: ${event.event || 'unknown'}, domain: ${event.body?.domain || 'unknown'}, owner: ${event.ownerId || 'unknown'}`);

    // Account filter: check if the event's account matches our configured account
    // The event URL contains the account ID: /ai/ringsense/v1/public/accounts/ACCOUNT_ID/...
    const config = getConfig();
    const configuredClientId = config.rc_client_id;
    const eventPath = event.event || '';
    const eventAccountMatch = eventPath.match(/accounts\/(\d+)\//);
    const eventAccountId = eventAccountMatch ? eventAccountMatch[1] : null;

    // Also check ownerId from the event
    const eventOwnerId = event.ownerId;

    // If we have a stored account ID from a previous successful API call, filter on it
    const storedAccountId = config.rc_account_id;
    if (storedAccountId && eventAccountId && eventAccountId !== storedAccountId) {
      console.log(`[WEBHOOK] REJECTED — event account ${eventAccountId} does not match configured account ${storedAccountId}`);
      return res.status(200).json({ received: true, filtered: true });
    }

    if (event.body) {
      const record = storeInteraction(event);
      console.log(`[WEBHOOK] Stored interaction: ${record.title} (${record.domain}/${record.sourceRecordId})`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK] Error processing event:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
});

// ─── Webhook Subscription Management (protected) ────────────────────────────
app.post('/api/webhook/subscribe', adminAuth, async (req, res) => {
  try {
    const config = getConfig();
    const webhookUrl = req.body.webhookUrl;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }

    // Subscribe to RingSense events for all domains
    const subscription = await rcApiFetch('/restapi/v1.0/subscription', {
      method: 'POST',
      body: JSON.stringify({
        eventFilters: [
          '/ai/ringsense/v1/public/accounts/~/domains/rcx/insights',
          '/ai/ringsense/v1/public/accounts/~/domains/pbx/insights',
          '/ai/ringsense/v1/public/accounts/~/domains/rcv/insights',
        ],
        deliveryMode: {
          transportType: 'WebHook',
          address: webhookUrl,
        },
        expiresIn: 604800, // 7 days
      }),
    });

    // Store subscription ID for renewal
    setConfig({ webhook_subscription_id: subscription.id, webhook_url: webhookUrl });

    res.json({
      success: true,
      subscriptionId: subscription.id,
      expiresAt: subscription.expirationTime,
      message: 'Webhook subscription created. RCX and PBX RingSense events will be delivered to your endpoint.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/webhook/status', adminAuth, async (req, res) => {
  try {
    const config = getConfig();
    const subId = config.webhook_subscription_id;
    let knownSub = null;
    let orphanedCount = 0;

    // Check the stored subscription
    if (subId) {
      try {
        knownSub = await rcApiFetch(`/restapi/v1.0/subscription/${subId}`);
      } catch {
        knownSub = null;
      }
    }

    // Also scan for any RingSense webhook subscriptions we don't know about
    try {
      const data = await rcApiFetch('/restapi/v1.0/subscription');
      const allSubs = data.records || [];
      for (const sub of allSubs) {
        if (sub.id === subId) continue;
        const isWebhook = sub.deliveryMode?.transportType === 'WebHook';
        const isRingSense = (sub.eventFilters || []).some(f => f.includes('ringsense'));
        if (isWebhook && isRingSense && sub.status === 'Active') {
          orphanedCount++;
        }
      }
    } catch {}

    if (knownSub) {
      return res.json({
        active: knownSub.status === 'Active',
        subscriptionId: knownSub.id,
        status: knownSub.status,
        expiresAt: knownSub.expirationTime,
        webhookUrl: config.webhook_url,
        storedInteractions: getInteractionCount(),
        orphanedSubscriptions: orphanedCount,
      });
    }

    return res.json({
      active: false,
      expired: !!subId,
      storedInteractions: getInteractionCount(),
      orphanedSubscriptions: orphanedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/webhook/subscribe', adminAuth, async (req, res) => {
  try {
    const results = [];

    // 1. Try to delete the stored subscription ID
    const config = getConfig();
    const subId = config.webhook_subscription_id;
    if (subId) {
      try {
        await rcApiFetch(`/restapi/v1.0/subscription/${subId}`, { method: 'DELETE' });
        results.push({ id: subId, deleted: true, source: 'stored' });
        console.log(`[WEBHOOK] Deleted stored subscription: ${subId}`);
      } catch (err) {
        results.push({ id: subId, deleted: false, error: err.message, source: 'stored' });
        console.warn(`[WEBHOOK] Failed to delete stored subscription ${subId}: ${err.message}`);
      }
    }

    // 2. Also fetch ALL subscriptions and delete any webhook subscriptions pointing to our endpoint
    try {
      const data = await rcApiFetch('/restapi/v1.0/subscription');
      const allSubs = data.records || [];
      for (const sub of allSubs) {
        const addr = sub.deliveryMode?.address || '';
        const isWebhook = sub.deliveryMode?.transportType === 'WebHook';
        const isOurs = addr.includes('/api/webhook/ringsense');
        const isRingSense = (sub.eventFilters || []).some(f => f.includes('ringsense'));

        if (isWebhook && (isOurs || isRingSense)) {
          // Skip if we already deleted it above
          if (sub.id === subId) continue;
          try {
            await rcApiFetch(`/restapi/v1.0/subscription/${sub.id}`, { method: 'DELETE' });
            results.push({ id: sub.id, deleted: true, source: 'scan', address: addr });
            console.log(`[WEBHOOK] Deleted additional subscription: ${sub.id} (${addr})`);
          } catch (err) {
            results.push({ id: sub.id, deleted: false, error: err.message, source: 'scan' });
          }
        }
      }
    } catch (err) {
      console.warn(`[WEBHOOK] Could not scan for additional subscriptions: ${err.message}`);
    }

    setConfig({ webhook_subscription_id: null, webhook_url: null });

    const deletedCount = results.filter(r => r.deleted).length;
    res.json({
      success: true,
      message: deletedCount > 0
        ? `Deleted ${deletedCount} subscription(s).`
        : 'No active subscriptions found to delete.',
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List ALL subscriptions on the current account
app.get('/api/webhook/subscriptions', adminAuth, async (req, res) => {
  try {
    const data = await rcApiFetch('/restapi/v1.0/subscription');
    const subs = (data.records || []).map(s => ({
      id: s.id,
      status: s.status,
      creationTime: s.creationTime,
      expirationTime: s.expirationTime,
      deliveryMode: s.deliveryMode,
      eventFilters: s.eventFilters,
    }));
    res.json({ subscriptions: subs, total: subs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete ALL subscriptions on the current account (nuclear option)
app.delete('/api/webhook/subscriptions/all', adminAuth, async (req, res) => {
  try {
    const data = await rcApiFetch('/restapi/v1.0/subscription');
    const subs = data.records || [];
    const results = [];
    for (const sub of subs) {
      try {
        await rcApiFetch(`/restapi/v1.0/subscription/${sub.id}`, { method: 'DELETE' });
        results.push({ id: sub.id, deleted: true });
      } catch (err) {
        results.push({ id: sub.id, deleted: false, error: err.message });
      }
    }
    setConfig({ webhook_subscription_id: null, webhook_url: null });
    res.json({ success: true, results, message: `Deleted ${results.filter(r=>r.deleted).length} of ${subs.length} subscriptions.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SFTP Routes (protected) ─────────────────────────────────────────────────
app.post('/api/sftp/test', adminAuth, async (req, res) => {
  try {
    const result = await testSftpConnection();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sftp/upload-now', adminAuth, async (req, res) => {
  try {
    const { daysBack } = req.body;
    const data = await fetchAllInsights(daysBack || 7);
    if (data.length === 0) {
      return res.json({ success: true, message: 'No recorded calls found for the period.' });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ringsense-export-${timestamp}.json`;
    const result = await uploadToSftp(data, filename);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Schedule Routes (protected) ─────────────────────────────────────────────
app.get('/api/schedule/status', adminAuth, (req, res) => {
  res.json(getScheduleStatus());
});

app.post('/api/schedule/start', adminAuth, (req, res) => {
  try {
    const result = startSchedule();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedule/stop', adminAuth, (req, res) => {
  stopSchedule();
  setConfig({ schedule_enabled: 'false' });
  res.json({ active: false });
});

app.post('/api/schedule/run-now', adminAuth, async (req, res) => {
  try {
    await runScheduledUpload();
    res.json({ success: true, message: 'Manual upload triggered.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedule/history', adminAuth, (req, res) => {
  res.json(getHistory());
});

// ─── Serve React build in production ─────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   RingSense Dashboard Server             ║`);
  console.log(`  ║   Port: ${PORT}                            ║`);
  console.log(`  ║   Mode: ${(process.env.NODE_ENV || 'development').padEnd(30)}║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  // Restore schedule if it was enabled
  try {
    const config = getConfig();
    if (config.schedule_enabled === 'true') {
      console.log('[BOOT] Restoring scheduled upload job...');
      startSchedule();
    }
  } catch (err) {
    console.error('[BOOT] Could not restore schedule:', err.message);
  }
});

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
    setConfig(updates);
    res.json({ success: true, config: getSafeConfig() });
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
    res.json({ success: true, message: 'Successfully authenticated with RingCentral API.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Call Log & Insights Routes (protected) ──────────────────────────────────
app.get('/api/calls', adminAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, perPage } = req.query;
    const params = new URLSearchParams({
      view: 'Simple',
      type: 'Voice',
      recordingType: 'All',
      perPage: perPage || '100',
      dateFrom: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (dateTo) params.set('dateTo', dateTo);

    const data = await rcApiFetch(`/restapi/v1.0/account/~/extension/~/call-log?${params}`);
    const records = (data.records || []).filter(r => r.recording);
    res.json({ records, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calls/:recordingId/insights', adminAuth, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { domain } = req.query;
    const data = await rcApiFetch(
      `/ai/ringsense/v1/public/accounts/~/domains/${domain || 'pbx'}/records/${recordingId}/insights`
    );
    res.json(data);
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

const SftpClient = require('ssh2-sftp-client');
const cron = require('node-cron');
const path = require('path');
const { getConfig, setConfig } = require('./store');
const { rcApiFetch } = require('./rcAuth');

let activeJob = null;
let jobHistory = [];
const MAX_HISTORY = 50;

function addHistory(entry) {
  jobHistory.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (jobHistory.length > MAX_HISTORY) jobHistory = jobHistory.slice(0, MAX_HISTORY);
}

function getHistory() {
  return jobHistory;
}

// ─── Build cron expression from user settings ────────────────────────────────
function buildCronExpression(config) {
  const { schedule_frequency, schedule_time } = config;
  if (!schedule_frequency || !schedule_time) return null;

  const [hour, minute] = schedule_time.split(':').map(Number);

  switch (schedule_frequency) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      // Run on Monday
      const dayOfWeek = config.schedule_day_of_week || 1;
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case 'monthly':
      // Run on the 1st
      const dayOfMonth = config.schedule_day_of_month || 1;
      return `${minute} ${hour} ${dayOfMonth} * *`;
    default:
      return null;
  }
}

// ─── Fetch all call insights data ────────────────────────────────────────────
async function fetchAllInsights(daysBack = 7) {
  const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    view: 'Simple',
    type: 'Voice',
    recordingType: 'All',
    perPage: '250',
    dateFrom,
  });

  const callLogs = await rcApiFetch(`/restapi/v1.0/account/~/extension/~/call-log?${params}`);
  // Deduplicate: same session can appear as both PBX and RingCX — keep one per recordingId
  const seen = new Set();
  const recordedCalls = (callLogs.records || []).filter(r => {
    if (!r.recording) return false;
    if (seen.has(r.recording.id)) return false;
    seen.add(r.recording.id);
    return true;
  });

  const results = [];
  for (const call of recordedCalls) {
    try {
      const insights = await rcApiFetch(
        `/ai/ringsense/v1/public/accounts/~/domains/pbx/records/${call.recording.id}/insights`
      );
      results.push({
        recordingId: call.recording.id,
        callInfo: {
          id: call.id,
          sessionId: call.sessionId,
          startTime: call.startTime,
          duration: call.duration,
          direction: call.direction,
          from: call.from,
          to: call.to,
          result: call.result,
          extension: (call.direction === 'Outbound')
            ? (call.from && call.from.name ? call.from.name : null)
            : (call.to   && call.to.name   ? call.to.name   : null),
        },
        insights,
        exportedAt: new Date().toISOString(),
      });
    } catch (err) {
      results.push({
        recordingId: call.recording.id,
        error: err.message,
        exportedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

// ─── Upload to SFTP ──────────────────────────────────────────────────────────
async function uploadToSftp(data, filename) {
  const config = getConfig();
  const { sftp_host, sftp_port, sftp_username, sftp_password, sftp_private_key, sftp_remote_path, sftp_auth_type } = config;

  if (!sftp_host || !sftp_username) {
    throw new Error('SFTP not configured. Go to Settings to configure host and credentials.');
  }

  const sftp = new SftpClient();
  const connectOpts = {
    host: sftp_host,
    port: parseInt(sftp_port || '22', 10),
    username: sftp_username,
    readyTimeout: 10000,
    retries: 2,
  };

  if (sftp_auth_type === 'key' && sftp_private_key) {
    connectOpts.privateKey = sftp_private_key;
  } else if (sftp_password) {
    connectOpts.password = sftp_password;
  } else {
    throw new Error('No SFTP authentication method configured (password or SSH key).');
  }

  try {
    await sftp.connect(connectOpts);

    const remotePath = sftp_remote_path || '/uploads';
    const remoteDir = remotePath.endsWith('/') ? remotePath : remotePath + '/';

    // Ensure remote directory exists
    const dirExists = await sftp.exists(remoteDir);
    if (!dirExists) {
      await sftp.mkdir(remoteDir, true);
    }

    const remoteFile = remoteDir + filename;
    const jsonStr = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonStr, 'utf8');

    await sftp.put(buffer, remoteFile);

    return {
      success: true,
      remoteFile,
      size: buffer.length,
      recordCount: Array.isArray(data) ? data.length : 1,
    };
  } finally {
    await sftp.end();
  }
}

// ─── Test SFTP Connection ────────────────────────────────────────────────────
async function testSftpConnection() {
  const config = getConfig();
  const { sftp_host, sftp_port, sftp_username, sftp_password, sftp_private_key, sftp_remote_path, sftp_auth_type } = config;

  if (!sftp_host || !sftp_username) {
    throw new Error('SFTP host and username are required.');
  }

  const sftp = new SftpClient();
  const connectOpts = {
    host: sftp_host,
    port: parseInt(sftp_port || '22', 10),
    username: sftp_username,
    readyTimeout: 10000,
  };

  if (sftp_auth_type === 'key' && sftp_private_key) {
    connectOpts.privateKey = sftp_private_key;
  } else if (sftp_password) {
    connectOpts.password = sftp_password;
  } else {
    throw new Error('No authentication credentials provided.');
  }

  try {
    await sftp.connect(connectOpts);
    const remotePath = sftp_remote_path || '/uploads';
    const exists = await sftp.exists(remotePath);
    await sftp.end();
    return {
      success: true,
      message: `Connected successfully. Remote path "${remotePath}" ${exists ? 'exists' : 'does not exist (will be created on upload)'}.`,
    };
  } catch (err) {
    throw new Error(`SFTP connection failed: ${err.message}`);
  }
}

// ─── Run a scheduled upload ──────────────────────────────────────────────────
async function runScheduledUpload() {
  const config = getConfig();
  const lookbackDays = parseInt(config.schedule_lookback_days || '7', 10);

  console.log(`[CRON] Starting scheduled upload at ${new Date().toISOString()}`);
  addHistory({ type: 'start', message: 'Scheduled upload started' });

  try {
    const data = await fetchAllInsights(lookbackDays);
    if (data.length === 0) {
      const msg = 'No recorded calls found for the lookback period.';
      console.log(`[CRON] ${msg}`);
      addHistory({ type: 'skip', message: msg });
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ringsense-export-${timestamp}.json`;
    const results = [];

    // Upload to SFTP if configured
    if (config.sftp_host && config.schedule_sftp_enabled !== 'false') {
      try {
        const sftpResult = await uploadToSftp(data, filename);
        const msg = `SFTP: Uploaded ${sftpResult.recordCount} records to ${sftpResult.remoteFile} (${Math.round(sftpResult.size / 1024)}KB)`;
        console.log(`[CRON] ${msg}`);
        addHistory({ type: 'success', message: msg });
        results.push({ target: 'sftp', success: true });
      } catch (err) {
        const msg = `SFTP upload failed: ${err.message}`;
        console.error(`[CRON] ${msg}`);
        addHistory({ type: 'error', message: msg });
        results.push({ target: 'sftp', success: false, error: err.message });
      }
    }

    // Upload to SharePoint if configured
    if (config.sp_site_id && config.schedule_sharepoint_enabled !== 'false') {
      try {
        const { uploadToSharePoint, uploadToSharePointByAgent } = require('./sharepoint');
        let spResult;
        if (config.sp_export_format !== 'json') {
          spResult = await uploadToSharePointByAgent(data);
          const msg = `SharePoint: Uploaded ${spResult.recordCount} calls across ${spResult.agentCount} agent folder(s) [${spResult.uploadTimestamp}]${spResult.errorCount ? ` (${spResult.errorCount} errors)` : ''}`;
          console.log(`[CRON] ${msg}`);
          addHistory({ type: spResult.errorCount ? 'error' : 'success', message: msg });
        } else {
          spResult = await uploadToSharePoint(data, filename);
          const msg = `SharePoint: Uploaded ${spResult.recordCount} records to "${spResult.fileName}" (${spResult.webUrl})`;
          console.log(`[CRON] ${msg}`);
          addHistory({ type: 'success', message: msg });
        }
        results.push({ target: 'sharepoint', success: true });
      } catch (err) {
        const msg = `SharePoint upload failed: ${err.message}`;
        console.error(`[CRON] ${msg}`);
        addHistory({ type: 'error', message: msg });
        results.push({ target: 'sharepoint', success: false, error: err.message });
      }
    }

    if (results.length === 0) {
      addHistory({ type: 'skip', message: 'No upload destinations configured (SFTP or SharePoint).' });
    }

    setConfig({ schedule_last_run: new Date().toISOString() });
  } catch (err) {
    const msg = `Upload failed: ${err.message}`;
    console.error(`[CRON] ${msg}`);
    addHistory({ type: 'error', message: msg });
  }
}

// ─── Schedule Manager ────────────────────────────────────────────────────────
function startSchedule() {
  stopSchedule();

  const config = getConfig();
  if (!config.schedule_enabled || config.schedule_enabled !== 'true') {
    console.log('[CRON] Schedule disabled.');
    return { active: false };
  }

  const cronExpr = buildCronExpression(config);
  if (!cronExpr) {
    console.log('[CRON] Invalid schedule configuration.');
    return { active: false, error: 'Invalid schedule' };
  }

  if (!cron.validate(cronExpr)) {
    console.log(`[CRON] Invalid cron expression: ${cronExpr}`);
    return { active: false, error: 'Invalid cron expression' };
  }

  activeJob = cron.schedule(cronExpr, runScheduledUpload, {
    scheduled: true,
    timezone: config.schedule_timezone || 'America/Denver',
  });

  console.log(`[CRON] Schedule started: "${cronExpr}" (${config.schedule_frequency} at ${config.schedule_time})`);
  addHistory({ type: 'schedule', message: `Schedule activated: ${config.schedule_frequency} at ${config.schedule_time}` });

  return {
    active: true,
    cronExpression: cronExpr,
    frequency: config.schedule_frequency,
    time: config.schedule_time,
    timezone: config.schedule_timezone || 'America/Denver',
  };
}

function stopSchedule() {
  if (activeJob) {
    activeJob.stop();
    activeJob = null;
    console.log('[CRON] Schedule stopped.');
  }
}

function getScheduleStatus() {
  const config = getConfig();
  return {
    active: !!activeJob,
    enabled: config.schedule_enabled === 'true',
    frequency: config.schedule_frequency || null,
    time: config.schedule_time || null,
    timezone: config.schedule_timezone || 'America/Denver',
    dayOfWeek: config.schedule_day_of_week || '1',
    dayOfMonth: config.schedule_day_of_month || '1',
    lookbackDays: config.schedule_lookback_days || '7',
    lastRun: config.schedule_last_run || null,
    cronExpression: buildCronExpression(config),
  };
}

module.exports = {
  uploadToSftp,
  testSftpConnection,
  fetchAllInsights,
  runScheduledUpload,
  startSchedule,
  stopSchedule,
  getScheduleStatus,
  getHistory,
};

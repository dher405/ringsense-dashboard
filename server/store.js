const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('./crypto');

const STORE_PATH = path.join(__dirname, '..', 'data', 'config.enc.json');

// Fields that must be encrypted at rest
const SENSITIVE_FIELDS = [
  'rc_client_secret',
  'rc_jwt',
  'rc_access_token',
  'rc_refresh_token',
  'sftp_password',
  'sftp_private_key',
  'sso_client_secret',
  'sp_client_secret',
  'sp_graph_token',
  'smtp_pass',
];

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function loadRaw() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveRaw(data) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getConfig() {
  const raw = loadRaw();
  const config = { ...raw };
  // Decrypt sensitive fields
  for (const field of SENSITIVE_FIELDS) {
    if (config[field]) {
      config[field] = decrypt(config[field]);
    }
  }
  return config;
}

function setConfig(updates) {
  const raw = loadRaw();
  const merged = { ...raw };

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') {
      delete merged[key];
      continue;
    }
    if (SENSITIVE_FIELDS.includes(key)) {
      merged[key] = encrypt(value);
    } else {
      merged[key] = value;
    }
  }

  merged.updated_at = new Date().toISOString();
  saveRaw(merged);
  return getConfig();
}

function clearConfig() {
  saveRaw({});
}

// Return a sanitized version for the frontend (mask secrets)
function getSafeConfig() {
  const config = getConfig();
  const safe = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (safe[field]) {
      // Show last 4 chars only
      const val = safe[field];
      safe[field] = val.length > 4
        ? '••••••••' + val.slice(-4)
        : '••••';
      safe[`${field}_set`] = true;
    } else {
      safe[`${field}_set`] = false;
    }
  }
  return safe;
}

module.exports = { getConfig, setConfig, clearConfig, getSafeConfig };

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./crypto');

const USERS_PATH = path.join(__dirname, '..', 'data', 'users.json');

function ensureDir() {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function loadUsers() {
  ensureDir();
  if (!fs.existsSync(USERS_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); }
  catch { return []; }
}

function saveUsers(users) {
  ensureDir();
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), { mode: 0o600 });
}

// ─── Password hashing (PBKDF2) ──────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

// ─── User CRUD ───────────────────────────────────────────────────────────────
function createUser({ email, password, name, role }) {
  const users = loadUsers();
  const emailLower = email.toLowerCase().trim();

  if (users.find(u => u.email === emailLower)) {
    throw new Error(`User with email "${emailLower}" already exists.`);
  }

  const user = {
    id: crypto.randomUUID(),
    email: emailLower,
    name: name || emailLower.split('@')[0],
    passwordHash: password ? hashPassword(password) : null,
    role: role || 'viewer', // 'admin' or 'viewer'
    authMethod: password ? 'local' : 'sso',
    createdAt: new Date().toISOString(),
    lastLogin: null,
    enabled: true,
  };

  users.push(user);
  saveUsers(users);
  return sanitizeUser(user);
}

function updateUser(userId, updates) {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) throw new Error('User not found.');

  if (updates.password) {
    users[idx].passwordHash = hashPassword(updates.password);
    delete updates.password;
  }
  if (updates.email) updates.email = updates.email.toLowerCase().trim();
  if (updates.name !== undefined) users[idx].name = updates.name;
  if (updates.email !== undefined) users[idx].email = updates.email;
  if (updates.role !== undefined) users[idx].role = updates.role;
  if (updates.enabled !== undefined) users[idx].enabled = updates.enabled;

  saveUsers(users);
  return sanitizeUser(users[idx]);
}

function deleteUser(userId) {
  let users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user) throw new Error('User not found.');
  users = users.filter(u => u.id !== userId);
  saveUsers(users);
  return true;
}

function getUsers() {
  return loadUsers().map(sanitizeUser);
}

function getUserById(userId) {
  const user = loadUsers().find(u => u.id === userId);
  return user ? sanitizeUser(user) : null;
}

function getUserByEmail(email) {
  return loadUsers().find(u => u.email === email.toLowerCase().trim()) || null;
}

// ─── Authentication ──────────────────────────────────────────────────────────
function authenticateLocal(email, password) {
  const user = getUserByEmail(email);
  if (!user) return null;
  if (!user.enabled) return null;
  if (!user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  // Update last login
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    users[idx].lastLogin = new Date().toISOString();
    saveUsers(users);
  }

  return sanitizeUser(user);
}

// SSO: find or create user by email from Azure AD token
function authenticateSSO(profile) {
  const email = (profile.email || profile.preferred_username || '').toLowerCase().trim();
  if (!email) throw new Error('No email in SSO profile.');

  let user = getUserByEmail(email);

  if (user) {
    if (!user.enabled) throw new Error('Account disabled. Contact an administrator.');
    // Update last login
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx].lastLogin = new Date().toISOString();
      users[idx].name = profile.name || users[idx].name;
      saveUsers(users);
    }
    return sanitizeUser(user);
  }

  // Auto-create SSO user if allowed (check config)
  const { getConfig } = require('./store');
  const config = getConfig();
  if (config.sso_auto_create !== 'true') {
    throw new Error(`No account for "${email}". Ask an admin to create your account or enable auto-provisioning.`);
  }

  // Check allowed domain
  const allowedDomain = config.sso_allowed_domain;
  if (allowedDomain) {
    const userDomain = email.split('@')[1];
    if (userDomain !== allowedDomain.toLowerCase().trim()) {
      throw new Error(`Email domain "${userDomain}" is not allowed. Only "${allowedDomain}" can sign in.`);
    }
  }

  return createUser({
    email,
    name: profile.name || email.split('@')[0],
    role: 'viewer',
  });
}

// Check if any users exist (for initial setup)
function hasUsers() {
  return loadUsers().length > 0;
}

// Check if admin password legacy mode is still needed
function isLegacyMode() {
  return !hasUsers();
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

module.exports = {
  createUser, updateUser, deleteUser,
  getUsers, getUserById, getUserByEmail,
  authenticateLocal, authenticateSSO,
  hasUsers, isLegacyMode,
};

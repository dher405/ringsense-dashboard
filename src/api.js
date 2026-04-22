// ─── Backend API Client ─────────────────────────────────────────────────────
// All calls go through the Express backend. Token stored in httpOnly cookie + header.

let adminToken = sessionStorage.getItem('admin_token') || null;

export function setAdminToken(token) {
  adminToken = token;
  if (token) {
    sessionStorage.setItem('admin_token', token);
  } else {
    sessionStorage.removeItem('admin_token');
  }
}

export function getAdminToken() {
  return adminToken;
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

// Auth
export const authLogin = (password, email) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password, email }) });
export const authLogout = () => api('/api/auth/logout', { method: 'POST' });
export const authCheck = () => api('/api/auth/check');
export const getSSOConfig = () => api('/api/auth/sso/config');
export const getSSOAuthUrl = () => api('/api/auth/sso/authorize');

// Users
export const listUsers = () => api('/api/users');
export const createUserApi = (data) => api('/api/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUserApi = (userId, data) => api(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteUserApi = (userId) => api(`/api/users/${userId}`, { method: 'DELETE' });

// Password Reset (no auth required)
export const forgotPassword = (email) => api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
export const verifyResetToken = (token) => api(`/api/auth/verify-reset-token?token=${token}`);
export const resetPasswordApi = (token, password) => api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });

// SMTP
export const testSmtp = () => api('/api/smtp/test', { method: 'POST' });

// Config
export const getConfig = () => api('/api/config');
export const updateConfig = (updates) => api('/api/config', { method: 'PUT', body: JSON.stringify(updates) });
export const deleteConfig = () => api('/api/config', { method: 'DELETE' });

// RC API
export const testRcConnection = () => api('/api/rc/test', { method: 'POST' });

// Calls
export const getCalls = (params) => {
  const qs = new URLSearchParams(params).toString();
  return api(`/api/calls?${qs}`);
};
export const getInsights = (recordingId, domain = 'pbx') => {
  const params = new URLSearchParams({ recordingId, domain });
  return api(`/api/calls/insights?${params}`);
};

// SFTP
export const testSftp = () => api('/api/sftp/test', { method: 'POST' });
export const uploadNow = (daysBack = 7) => api('/api/sftp/upload-now', { method: 'POST', body: JSON.stringify({ daysBack }) });

// SharePoint
export const testSharePoint = () => api('/api/sharepoint/test', { method: 'POST' });
export const uploadSharePointNow = (daysBack = 7) => api('/api/sharepoint/upload-now', { method: 'POST', body: JSON.stringify({ daysBack }) });
export const searchSharePointSites = (search) => api(`/api/sharepoint/sites?search=${encodeURIComponent(search || '')}`);
export const listSharePointDrives = (siteId) => api(`/api/sharepoint/drives/${siteId}`);
export const lookupSharePointSite = (url) => api('/api/sharepoint/lookup', { method: 'POST', body: JSON.stringify({ url }) });
export const debugSharePoint = () => api('/api/debug/sharepoint');

// Schedule
export const getScheduleStatus = () => api('/api/schedule/status');
export const startSchedule = () => api('/api/schedule/start', { method: 'POST' });
export const stopSchedule = () => api('/api/schedule/stop', { method: 'POST' });
export const runScheduleNow = () => api('/api/schedule/run-now', { method: 'POST' });
export const getScheduleHistory = () => api('/api/schedule/history');

// Webhook
export const subscribeWebhook = (webhookUrl) => api('/api/webhook/subscribe', { method: 'POST', body: JSON.stringify({ webhookUrl }) });
export const unsubscribeWebhook = () => api('/api/webhook/subscribe', { method: 'DELETE' });
export const getWebhookStatus = () => api('/api/webhook/status');
export const clearInteractions = () => api('/api/interactions', { method: 'DELETE' });
export const listAllSubscriptions = () => api('/api/webhook/subscriptions');
export const deleteAllSubscriptions = () => api('/api/webhook/subscriptions/all', { method: 'DELETE' });

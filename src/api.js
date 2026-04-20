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
export const authLogin = (password) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
export const authLogout = () => api('/api/auth/logout', { method: 'POST' });
export const authCheck = () => api('/api/auth/check');

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

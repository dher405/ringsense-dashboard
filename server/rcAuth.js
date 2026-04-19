const { getConfig, setConfig } = require('./store');

async function getAccessToken() {
  const config = getConfig();
  const { rc_client_id, rc_client_secret, rc_jwt, rc_server_url, rc_access_token, rc_token_expiry } = config;

  // If we have a valid token, return it
  if (rc_access_token && rc_token_expiry && Date.now() < parseInt(rc_token_expiry, 10)) {
    return rc_access_token;
  }

  // Need to authenticate
  if (!rc_client_id || !rc_client_secret || !rc_jwt) {
    throw new Error('RingCentral API credentials not configured. Go to Settings to configure.');
  }

  const serverUrl = rc_server_url || 'https://platform.ringcentral.com';

  const res = await fetch(`${serverUrl}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${rc_client_id}:${rc_client_secret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: rc_jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`RC Auth failed: ${err.error_description || res.statusText}`);
  }

  const data = await res.json();

  // Store the new token (encrypted)
  setConfig({
    rc_access_token: data.access_token,
    rc_refresh_token: data.refresh_token || null,
    rc_token_expiry: String(Date.now() + (data.expires_in * 1000)),
  });

  return data.access_token;
}

async function rcApiFetch(path, options = {}) {
  const config = getConfig();
  const serverUrl = config.rc_server_url || 'https://platform.ringcentral.com';
  const token = await getAccessToken();

  const url = path.startsWith('http') ? path : `${serverUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`RC API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

module.exports = { getAccessToken, rcApiFetch };

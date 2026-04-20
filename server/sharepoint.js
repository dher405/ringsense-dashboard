const { getConfig, setConfig } = require('./store');

// ─── Get Graph API access token using client credentials ─────────────────────
async function getGraphToken() {
  const config = getConfig();
  const tenantId = config.sp_tenant_id || config.sso_tenant_id;
  const clientId = config.sp_client_id || config.sso_client_id;
  const clientSecret = config.sp_client_secret || config.sso_client_secret;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('SharePoint not configured. Set tenant ID, client ID, and client secret in Settings → SharePoint.');
  }

  // Check cached token
  const cachedToken = config.sp_graph_token;
  const cachedExpiry = parseInt(config.sp_graph_token_expiry || '0', 10);
  if (cachedToken && cachedExpiry > Date.now() + 60000) {
    return cachedToken;
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph auth failed: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  setConfig({
    sp_graph_token: data.access_token,
    sp_graph_token_expiry: String(Date.now() + data.expires_in * 1000),
  });

  return data.access_token;
}

// ─── Upload file to SharePoint ───────────────────────────────────────────────
async function uploadToSharePoint(data, filename) {
  const config = getConfig();
  const { sp_site_id, sp_drive_id, sp_folder_path } = config;

  if (!sp_site_id) {
    throw new Error('SharePoint Site ID not configured. Go to Settings → SharePoint.');
  }

  const token = await getGraphToken();
  const jsonStr = JSON.stringify(data, null, 2);
  const buffer = Buffer.from(jsonStr, 'utf8');
  const folderPath = sp_folder_path || '/RingSense Exports';
  const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');

  // Build the upload URL
  // If drive_id is set, use it; otherwise use the default drive of the site
  let uploadUrl;
  if (sp_drive_id) {
    uploadUrl = `https://graph.microsoft.com/v1.0/drives/${sp_drive_id}/root:/${cleanPath}/${filename}:/content`;
  } else {
    uploadUrl = `https://graph.microsoft.com/v1.0/sites/${sp_site_id}/drive/root:/${cleanPath}/${filename}:/content`;
  }

  console.log(`[SHAREPOINT] Uploading to: ${uploadUrl} (${Math.round(buffer.length / 1024)}KB)`);

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: buffer,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SharePoint upload failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const result = await res.json();
  return {
    success: true,
    fileName: result.name,
    webUrl: result.webUrl,
    size: result.size,
    recordCount: Array.isArray(data) ? data.length : 1,
  };
}

// ─── Test SharePoint connection ──────────────────────────────────────────────
async function testSharePointConnection() {
  const config = getConfig();
  const { sp_site_id, sp_drive_id } = config;

  if (!sp_site_id) {
    throw new Error('SharePoint Site ID not configured.');
  }

  const token = await getGraphToken();

  // Test by fetching site info
  const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${sp_site_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!siteRes.ok) {
    const err = await siteRes.text();
    throw new Error(`Cannot access SharePoint site: ${err.slice(0, 200)}`);
  }

  const site = await siteRes.json();

  // Also test drive access
  let driveInfo = null;
  try {
    const driveUrl = sp_drive_id
      ? `https://graph.microsoft.com/v1.0/drives/${sp_drive_id}`
      : `https://graph.microsoft.com/v1.0/sites/${sp_site_id}/drive`;
    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (driveRes.ok) driveInfo = await driveRes.json();
  } catch {}

  return {
    success: true,
    message: `Connected to "${site.displayName}" (${site.webUrl}).${driveInfo ? ` Drive: "${driveInfo.name}"` : ''}`,
    siteName: site.displayName,
    siteUrl: site.webUrl,
  };
}

// ─── List available sites (helper for setup) ─────────────────────────────────
async function listSites(searchQuery) {
  const token = await getGraphToken();
  const url = searchQuery
    ? `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(searchQuery)}&$top=10`
    : `https://graph.microsoft.com/v1.0/sites?$top=10`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list sites: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.value || []).map(s => ({
    id: s.id,
    name: s.displayName,
    webUrl: s.webUrl,
    description: s.description,
  }));
}

// ─── List drives for a site ──────────────────────────────────────────────────
async function listDrives(siteId) {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list drives: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.value || []).map(d => ({
    id: d.id,
    name: d.name,
    driveType: d.driveType,
    webUrl: d.webUrl,
  }));
}

module.exports = {
  uploadToSharePoint,
  testSharePointConnection,
  listSites,
  listDrives,
};

const { getConfig, setConfig } = require('./store');

// ─── Helper: pad a number with leading zeros ──────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

// ─── Helper: sanitize a string for use in a filename ─────────────────────────
function sanitizeForFilename(s) {
  return (s || 'unknown').replace(/[^a-zA-Z0-9+\-]/g, '_').replace(/_+/g, '_').slice(0, 40);
}

// ─── Build a human-readable filename for one call ────────────────────────────
function buildCallFilename(call) {
  const info = call.callInfo || call;
  const raw = info.startTime || info.date || info.time || null;
  let datePart = 'unknown_date', timePart = 'unknown_time';
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d)) {
      datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
      timePart = `${pad(d.getHours())}${pad(d.getMinutes())}`;
    }
  }
  const fromObj = info.from || {};
  const toObj   = info.to   || {};
  const from = sanitizeForFilename(fromObj.phoneNumber || fromObj.name || fromObj || info.callerNumber || info.callingNumber);
  const to   = sanitizeForFilename(toObj.phoneNumber   || toObj.name   || toObj   || info.calleeNumber || info.calledNumber);
  return `${datePart}_${timePart}_from_${from}_to_${to}.txt`;
}

// ─── Format one call record as a readable plain-text block ───────────────────
function formatCallAsTxt(call) {
  const lines = [];
  const info = call.callInfo || call;
  const insights = call.insights || call.ringSenseInsights || null;

  lines.push('='.repeat(60));
  lines.push('RINGSENSE CALL RECORD');
  lines.push('='.repeat(60));
  lines.push('');

  const raw = info.startTime || info.date || info.time || null;
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d)) {
      lines.push(`Date         : ${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
      lines.push(`Time         : ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    } else {
      lines.push(`Date/Time    : ${raw}`);
    }
  }

  const fromObj = info.from || {};
  const toObj   = info.to   || {};
  lines.push(`Calling      : ${fromObj.phoneNumber || fromObj.name || fromObj || 'Unknown'}`);
  lines.push(`Called       : ${toObj.phoneNumber   || toObj.name   || toObj   || 'Unknown'}`);

  if (info.duration !== undefined) {
    const d = parseInt(info.duration, 10);
    lines.push(`Duration     : ${Math.floor(d / 60)}m ${d % 60}s`);
  }
  if (info.direction)   lines.push(`Direction    : ${info.direction}`);
  if (info.result)      lines.push(`Result       : ${info.result}`);
  if (call.recordingId) lines.push(`Recording ID : ${call.recordingId}`);
  if (info.sessionId)   lines.push(`Session ID   : ${info.sessionId}`);
  if (info.id)          lines.push(`Call ID      : ${info.id}`);

  lines.push('');

  if (insights) {
    if (insights.summary || insights.brief) {
      lines.push('-'.repeat(40));
      lines.push('SUMMARY');
      lines.push('-'.repeat(40));
      lines.push(insights.summary || insights.brief || '');
      lines.push('');
    }
    if (insights.aiScore !== undefined || insights.score !== undefined) {
      lines.push('-'.repeat(40));
      lines.push('AI SCORE');
      lines.push('-'.repeat(40));
      lines.push(String(insights.aiScore !== undefined ? insights.aiScore : insights.score));
      lines.push('');
    }
    const highlights = insights.highlights || insights.keyMoments || insights.moments || [];
    if (highlights.length) {
      lines.push('-'.repeat(40));
      lines.push('HIGHLIGHTS');
      lines.push('-'.repeat(40));
      highlights.forEach((h, i) => {
        const text = typeof h === 'string' ? h : (h.text || h.content || h.description || JSON.stringify(h));
        lines.push(`${i + 1}. ${text}`);
      });
      lines.push('');
    }
    const nextSteps = insights.nextSteps || insights.actionItems || insights.actions || [];
    if (nextSteps.length) {
      lines.push('-'.repeat(40));
      lines.push('NEXT STEPS / ACTION ITEMS');
      lines.push('-'.repeat(40));
      nextSteps.forEach((s, i) => {
        const text = typeof s === 'string' ? s : (s.text || s.content || s.description || JSON.stringify(s));
        lines.push(`${i + 1}. ${text}`);
      });
      lines.push('');
    }
    if (insights.notes || insights.callNotes) {
      lines.push('-'.repeat(40));
      lines.push('CALL NOTES');
      lines.push('-'.repeat(40));
      lines.push(insights.notes || insights.callNotes);
      lines.push('');
    }
    const transcript = insights.transcript || insights.transcription || null;
    if (transcript) {
      lines.push('-'.repeat(40));
      lines.push('TRANSCRIPT');
      lines.push('-'.repeat(40));
      const entries = Array.isArray(transcript)
        ? transcript
        : (transcript.entries || transcript.utterances || []);
      if (entries.length) {
        entries.forEach(e => {
          const speaker = e.speaker || e.name || e.speakerId || 'Speaker';
          const text    = e.text || e.content || e.message || '';
          const ts      = e.startTime !== undefined
            ? ` [${Math.floor(e.startTime / 60)}:${pad(Math.floor(e.startTime % 60))}]`
            : '';
          lines.push(`${speaker}${ts}: ${text}`);
        });
      } else if (typeof transcript === 'string') {
        lines.push(transcript);
      }
      lines.push('');
    }
  }

  if (call.error) {
    lines.push('-'.repeat(40));
    lines.push('ERROR');
    lines.push('-'.repeat(40));
    lines.push(call.error);
    lines.push('');
  }

  lines.push('='.repeat(60));
  return lines.join('\n');
}

// ─── Build a ZIP buffer from call records using raw ZIP format (no deps) ──────
// Uses STORE (no compression) so we don't need zlib — files are plain text
// and already small. This produces a valid .zip readable by any unzip tool.
function buildZipBuffer(calls) {
  // ZIP spec constants
  const LOCAL_FILE_HEADER_SIG  = 0x04034b50;
  const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
  const END_CENTRAL_DIR_SIG    = 0x06054b50;

  const entries = calls.map(call => {
    const filename = buildCallFilename(call);
    const content  = Buffer.from(formatCallAsTxt(call), 'utf8');
    const crc      = crc32(content);
    return { filename, content, crc };
  });

  const localHeaders = [];
  const centralDirs  = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.filename, 'utf8');
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(20, 4);   // version needed
    localHeader.writeUInt16LE(0, 6);    // flags
    localHeader.writeUInt16LE(0, 8);    // compression: STORE
    localHeader.writeUInt16LE(0, 10);   // mod time
    localHeader.writeUInt16LE(0, 12);   // mod date
    localHeader.writeUInt32LE(entry.crc, 14);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);   // extra field length
    nameBytes.copy(localHeader, 30);

    const centralDir = Buffer.alloc(46 + nameBytes.length);
    centralDir.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    centralDir.writeUInt16LE(20, 4);    // version made by
    centralDir.writeUInt16LE(20, 6);    // version needed
    centralDir.writeUInt16LE(0, 8);     // flags
    centralDir.writeUInt16LE(0, 10);    // compression
    centralDir.writeUInt16LE(0, 12);    // mod time
    centralDir.writeUInt16LE(0, 14);    // mod date
    centralDir.writeUInt32LE(entry.crc, 16);
    centralDir.writeUInt32LE(entry.content.length, 20);
    centralDir.writeUInt32LE(entry.content.length, 24);
    centralDir.writeUInt16LE(nameBytes.length, 28);
    centralDir.writeUInt16LE(0, 30);    // extra field length
    centralDir.writeUInt16LE(0, 32);    // comment length
    centralDir.writeUInt16LE(0, 34);    // disk start
    centralDir.writeUInt16LE(0, 36);    // internal attrs
    centralDir.writeUInt32LE(0, 38);    // external attrs
    centralDir.writeUInt32LE(offset, 42); // relative offset
    nameBytes.copy(centralDir, 46);

    localHeaders.push(localHeader, entry.content);
    centralDirs.push(centralDir);
    offset += localHeader.length + entry.content.length;
  }

  const centralDirBuffer = Buffer.concat(centralDirs);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_CENTRAL_DIR_SIG, 0);
  endRecord.writeUInt16LE(0, 4);   // disk number
  endRecord.writeUInt16LE(0, 6);   // start disk
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirBuffer.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);  // comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, endRecord]);
}

// ─── CRC-32 implementation (needed for ZIP) ───────────────────────────────────
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

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

// ─── Upload file to SharePoint (raw buffer + explicit content-type) ──────────
async function _uploadBuffer(token, siteId, driveId, folderPath, filename, buffer, contentType) {
  const cleanPath = (folderPath || '/RingSense Exports').replace(/^\/+|\/+$/g, '');
  let uploadUrl;
  if (driveId) {
    uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${cleanPath}/${filename}:/content`;
  } else {
    uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${cleanPath}/${filename}:/content`;
  }
  console.log(`[SHAREPOINT] Uploading ${filename} to: ${uploadUrl} (${Math.round(buffer.length / 1024)}KB)`);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: buffer,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SharePoint upload failed (${res.status}): ${errBody.slice(0, 300)}`);
  }
  return await res.json();
}

// ─── Upload call data as a ZIP of individual TXT files ───────────────────────
async function uploadToSharePointAsZip(calls) {
  const config = getConfig();
  const { sp_site_id, sp_drive_id, sp_folder_path } = config;
  if (!sp_site_id) throw new Error('SharePoint Site ID not configured. Go to Settings → SharePoint.');
  const now = new Date();
  const ts  = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const zipName = `ringsense_export_${ts}.zip`;
  const token  = await getGraphToken();
  const buffer = buildZipBuffer(calls);
  const result = await _uploadBuffer(token, sp_site_id, sp_drive_id, sp_folder_path, zipName, buffer, 'application/zip');
  return {
    success: true,
    fileName: result.name,
    webUrl: result.webUrl,
    size: result.size,
    recordCount: calls.length,
    format: 'zip_txt',
  };
}

// ─── Upload file to SharePoint (JSON format, legacy/default) ─────────────────
async function uploadToSharePoint(data, filename) {
  const config = getConfig();
  const { sp_site_id, sp_drive_id, sp_folder_path } = config;
  if (!sp_site_id) throw new Error("SharePoint Site ID not configured. Go to Settings u2192 SharePoint.");
  const token  = await getGraphToken();
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf8");
  const result = await _uploadBuffer(token, sp_site_id, sp_drive_id, sp_folder_path, filename, buffer, "application/json");
  return { success: true, fileName: result.name, webUrl: result.webUrl, size: result.size, recordCount: Array.isArray(data) ? data.length : 1, format: "json" };
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

// ─── Lookup site by URL ──────────────────────────────────────────────────────
async function lookupSiteByUrl(siteUrl) {
  const token = await getGraphToken();

  // Parse the URL: https://tenant.sharepoint.com/sites/SiteName
  let hostname, sitePath;
  try {
    const parsed = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);
    hostname = parsed.hostname;
    sitePath = parsed.pathname.replace(/\/+$/, '');
  } catch {
    throw new Error('Invalid URL format. Expected: https://tenant.sharepoint.com/sites/SiteName');
  }

  console.log(`[SHAREPOINT] Lookup: hostname=${hostname}, path=${sitePath}`);
  const errors = [];

  // Approach 1: hostname:/path (standard Graph format for subsites)
  if (sitePath && sitePath !== '/') {
    try {
      const url = `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`;
      console.log(`[SHAREPOINT] Try 1: ${url}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const site = await res.json();
        return { id: site.id, name: site.displayName, webUrl: site.webUrl };
      }
      const err = await res.text();
      errors.push(`Approach 1 (${res.status}): ${err.slice(0, 150)}`);
    } catch (e) { errors.push(`Approach 1: ${e.message}`); }
  }

  // Approach 2: hostname only (root site)
  try {
    const url = `https://graph.microsoft.com/v1.0/sites/${hostname}`;
    console.log(`[SHAREPOINT] Try 2: ${url}`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const site = await res.json();
      // If they asked for a subsite but we only got root, note that
      if (sitePath && sitePath !== '/' && sitePath !== '') {
        return { id: site.id, name: site.displayName, webUrl: site.webUrl, note: 'Root site returned — subsite lookup failed. Try the search approach.' };
      }
      return { id: site.id, name: site.displayName, webUrl: site.webUrl };
    }
    const err = await res.text();
    errors.push(`Approach 2 (${res.status}): ${err.slice(0, 150)}`);
  } catch (e) { errors.push(`Approach 2: ${e.message}`); }

  // Approach 3: search by site name extracted from path
  const siteName = sitePath.split('/').filter(Boolean).pop();
  if (siteName) {
    try {
      const url = `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(siteName)}&$top=5`;
      console.log(`[SHAREPOINT] Try 3 (search): ${url}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const sites = data.value || [];
        // Try to match by URL
        const match = sites.find(s => s.webUrl && s.webUrl.toLowerCase().includes(siteName.toLowerCase()));
        if (match) {
          return { id: match.id, name: match.displayName, webUrl: match.webUrl, method: 'search' };
        }
        if (sites.length > 0) {
          return { id: sites[0].id, name: sites[0].displayName, webUrl: sites[0].webUrl, method: 'search-first-result' };
        }
      }
      const err = await res.text();
      errors.push(`Approach 3 (${res.status}): ${err.slice(0, 150)}`);
    } catch (e) { errors.push(`Approach 3: ${e.message}`); }
  }

  console.error(`[SHAREPOINT] All lookup approaches failed:`, errors);
  throw new Error(`Site lookup failed. Tried 3 approaches:\n${errors.join('\n')}`);
}

// ─── Debug: test Graph API access directly ───────────────────────────────────
async function debugGraphAccess() {
  const token = await getGraphToken();
  const results = {};

  // Test 1: Can we access the Graph API at all?
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/organization', {
      headers: { Authorization: `Bearer ${token}` },
    });
    results.organization = res.ok ? 'OK' : `Error ${res.status}: ${(await res.text()).slice(0, 100)}`;
  } catch (e) { results.organization = e.message; }

  // Test 2: Can we list sites?
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/sites?$top=3', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      results.listSites = { status: 'OK', count: (data.value || []).length, sites: (data.value || []).map(s => ({ id: s.id, name: s.displayName, webUrl: s.webUrl })) };
    } else {
      results.listSites = `Error ${res.status}: ${(await res.text()).slice(0, 150)}`;
    }
  } catch (e) { results.listSites = e.message; }

  // Test 3: Search for the site
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/sites?search=Lisinski&$top=5', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      results.searchSites = { status: 'OK', count: (data.value || []).length, sites: (data.value || []).map(s => ({ id: s.id, name: s.displayName, webUrl: s.webUrl })) };
    } else {
      results.searchSites = `Error ${res.status}: ${(await res.text()).slice(0, 150)}`;
    }
  } catch (e) { results.searchSites = e.message; }

  // Test 4: Direct hostname lookup
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/sites/lisinskifirmcom.sharepoint.com', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const site = await res.json();
      results.rootSite = { status: 'OK', id: site.id, name: site.displayName };
    } else {
      results.rootSite = `Error ${res.status}: ${(await res.text()).slice(0, 150)}`;
    }
  } catch (e) { results.rootSite = e.message; }

  // Test 5: Subsite lookup
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/sites/lisinskifirmcom.sharepoint.com:/sites/Lisinski-IT', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const site = await res.json();
      results.subSite = { status: 'OK', id: site.id, name: site.displayName };
    } else {
      results.subSite = `Error ${res.status}: ${(await res.text()).slice(0, 150)}`;
    }
  } catch (e) { results.subSite = e.message; }

  results.tokenPreview = token ? `${token.slice(0, 20)}...` : 'NONE';
  return results;
}

module.exports = {
  uploadToSharePoint,
  uploadToSharePointAsZip,
  testSharePointConnection,
  listSites,
  listDrives,
  lookupSiteByUrl,
  debugGraphAccess,
};

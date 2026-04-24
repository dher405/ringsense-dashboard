const { getConfig, setConfig } = require('./store');

// ─── Helper: pad a number with leading zeros ──────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

// ─── Helper: sanitize a string for use in a filename ─────────────────
function sanitizeForFilename(s) {
  const str = (s !== null && s !== undefined && typeof s !== 'object') ? String(s) : 'unknown';
  return (str || 'unknown').replace(/[^a-zA-Z0-9+-]/g, '_').replace(/_+/g, '_').slice(0, 40);
}

// ─── Resolve a from/to field to a plain string ──────────────────────
function resolveParty(obj) {
  if (!obj) return 'unknown';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object') {
    return obj.phoneNumber || obj.extensionNumber || obj.name || obj.id || 'unknown';
  }
  return String(obj);
}

// ─── Build a human-readable filename for one call ────────────────────
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
  const from = sanitizeForFilename(resolveParty(info.from) || info.callerNumber || info.callingNumber);
  const to   = sanitizeForFilename(resolveParty(info.to)   || info.calleeNumber || info.calledNumber);
  return `${datePart}_${timePart}_from_${from}_to_${to}.pdf`;
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

// ─── PDF generation helpers ──────────────────────────────────────────────────
const ROLE_COLORS = {
  host:     { bg: '#FFF3EE', text: '#C2410C' },
  customer: { bg: '#EFF6FF', text: '#1D4ED8' },
  guest:    { bg: '#F0FDF4', text: '#166534' },
  agent:    { bg: '#F3F4F6', text: '#374151' },
};

function getSpeakerRole(speaker) {
  if (!speaker) return 'agent';
  const s = speaker.toLowerCase();
  if (s.includes('host') || s.includes('agent')) return 'host';
  if (s.includes('customer') || s.includes('caller')) return 'customer';
  if (s.includes('guest')) return 'guest';
  return 'agent';
}

function fmtTs(seconds) {
  if (seconds === undefined || seconds === null) return '';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const base = `${pad(m)}:${pad(sec)}`;
  return h > 0 ? `${pad(h)}:${base}` : base;
}

async function formatCallAsPdf(call) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const info        = call.callInfo || call;
    // Real RingSense API: top-level insights object contains nested .insights fields
    const insightsObj  = call.insights || {};
    const insightsData = insightsObj.insights || insightsObj; // handle both wrapped and flat
    const speakerInfo  = insightsObj.speakerInfo || call.speakerInfo || [];

    // Helper: resolve speakerId to display name using speakerInfo
    const speakerName = (seg) => {
      if (seg.name && !seg.name.startsWith('P-')) return seg.name;
      const match = speakerInfo.find(s => s.speakerId === seg.speakerId);
      if (match) return match.name || match.phoneNumber || seg.speakerId || 'Speaker';
      return seg.name || seg.speakerId || 'Speaker';
    };

    // Real API field paths — all insight fields are arrays of {value, start, end, speakerId?}
    const transcript  = insightsData.Transcript  || insightsData.transcript  || [];

    // Summary: array of {value} OR plain string
    const summaryRaw  = insightsData.Summary || insightsData.BulletedSummary || insightsData.summary || insightsData.brief || null;
    const summaryText = !summaryRaw ? null
      : Array.isArray(summaryRaw)
        ? summaryRaw.map(s => typeof s === 'string' ? s : (s.value || s.text || '')).filter(Boolean).join(' ')
        : (typeof summaryRaw === 'string' ? summaryRaw : (summaryRaw.value || summaryRaw.text || JSON.stringify(summaryRaw)));

    // Highlights: array of {value, speakerId} objects
    const highlightsRaw = insightsData.Highlights || insightsData.HighLights || insightsData.highlights ||
                          insightsData.KeyMoments || insightsData.keyMoments || insightsData.Moments || [];
    const highlights = Array.isArray(highlightsRaw)
      ? highlightsRaw.map(h => typeof h === 'string' ? h : (h.value || h.text || '')).filter(Boolean)
      : [];

    // NextSteps: array of {value, speakerId} objects
    const nextStepsRaw = insightsData.NextSteps || insightsData.nextSteps ||
                         insightsData.ActionItems || insightsData.actionItems ||
                         insightsData.next_steps  || insightsData.action_items || [];
    const nextSteps = Array.isArray(nextStepsRaw)
      ? nextStepsRaw.map(s => typeof s === 'string' ? s : (s.value || s.text || '')).filter(Boolean)
      : [];

    // CallNotes: string, array, or object — only when AI Notes enabled during call
    const callNotesRaw = insightsData.CallNotes || insightsData.callNotes || insightsData.Notes || insightsData.notes || null;
    const callNotes = !callNotesRaw ? null
      : (typeof callNotesRaw === 'string' ? callNotesRaw
        : Array.isArray(callNotesRaw)
          ? callNotesRaw.map(n => typeof n === 'string' ? n : (n.value || n.text || '')).filter(Boolean).join('\n')
          : (callNotesRaw.value || callNotesRaw.text || JSON.stringify(callNotesRaw)));

    // AIScore: [{value: "7"}] array — extract first value
    const aiScoreRaw = insightsData.AIScore || insightsData.aiScore || null;
    const aiScore = !aiScoreRaw ? null
      : Array.isArray(aiScoreRaw) && aiScoreRaw.length > 0
        ? (aiScoreRaw[0].value ?? aiScoreRaw[0].score ?? null)
        : (typeof aiScoreRaw === 'object' ? (aiScoreRaw.value ?? aiScoreRaw.score ?? null) : aiScoreRaw);

    const W = doc.page.width - 100;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 72).fill('#FFFFFF');
    doc.rect(0, 70, doc.page.width, 2).fill('#E5E7EB');
    doc.fontSize(10).fillColor('#FF6B35').font('Helvetica-Bold').text('RingCentral', 50, 20);
    doc.rect(50, 32, 60, 2).fill('#FF6B35');
    doc.fontSize(7).fillColor('#6B7280').font('Helvetica').text('CONVERSATION INTELLIGENCE', 50, 37);

    // ── Title ───────────────────────────────────────────────────────────────
    const fromObj    = info.from || {};
    const toObj      = info.to   || {};
    const direction  = (info.direction || insightsObj.callDirection || '').toLowerCase();
    const fromName   = fromObj.phoneNumber || fromObj.name || 'Unknown';
    const toName     = toObj.phoneNumber   || toObj.name   || 'Unknown';
    const otherParty = direction === 'outbound' ? toName : fromName;
    const title = `${direction === 'outbound' ? 'Outbound' : 'Inbound'} call with ${otherParty}`;

    doc.fontSize(22).fillColor('#111827').font('Helvetica-Bold').text(title, 50, 90, { width: W });

    // ── Date/Time ───────────────────────────────────────────────────────────
    const startRaw = info.startTime || insightsObj.recordingStartTime || null;
    if (startRaw) {
      const d = new Date(startRaw);
      if (!isNaN(d)) {
        const dateStr = d.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
                      + ', ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
        doc.fontSize(12).fillColor('#6B7280').font('Helvetica').text(dateStr, 50, doc.y + 4);
      }
    }

    // ── Metadata ────────────────────────────────────────────────────────────
    doc.moveDown(0.8);
    const meta = [];
    if (info.duration || insightsObj.recordingDurationMs) {
      const d = info.duration
        ? parseInt(info.duration, 10)
        : Math.round(insightsObj.recordingDurationMs / 1000);
      meta.push(`Duration: ${Math.floor(d/60)}m ${d%60}s`);
    }
    if (info.result)    meta.push(`Result: ${info.result}`);
    if (info.direction || insightsObj.callDirection) meta.push(`Direction: ${info.direction || insightsObj.callDirection}`);
    if (speakerInfo.length) meta.push(`Speakers: ${speakerInfo.map(s => s.name || s.phoneNumber).join(', ')}`);
    if (meta.length) {
      doc.fontSize(10).fillColor('#6B7280').font('Helvetica').text(meta.join('  ·  '), 50, doc.y, { width: W });
    }
    doc.moveDown(0.5);
    doc.rect(50, doc.y, W, 1).fill('#E5E7EB');
    doc.moveDown(0.8);

    // ── Summary ─────────────────────────────────────────────────────────────
    if (summaryText) {
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text('Summary');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#374151').font('Helvetica').text(summaryText, { width: W });
      doc.moveDown(0.8);
    }

    // ── AI Score ─────────────────────────────────────────────────────────────
    if (aiScore !== null && aiScore !== undefined) {
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text('AI Confidence Score');
      doc.moveDown(0.2);
      doc.fontSize(22).fillColor('#FF6B35').font('Helvetica-Bold').text(String(aiScore));
      doc.moveDown(0.8);
    }

    // ── Highlights ───────────────────────────────────────────────────────────
    if (highlights.length) {
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text('Highlights');
      doc.moveDown(0.3);
      highlights.forEach((h, i) => {
        doc.fontSize(11).fillColor('#374151').font('Helvetica').text(`${i+1}. ${h}`, { width: W });
      });
      doc.moveDown(0.8);
    }

    // ── Next Steps ───────────────────────────────────────────────────────────
    if (nextSteps.length) {
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text('Next Steps');
      doc.moveDown(0.3);
      nextSteps.forEach((s, i) => {
        doc.fontSize(11).fillColor('#374151').font('Helvetica').text(`${i+1}. ${s}`, { width: W });
      });
      doc.moveDown(0.8);
    }

    // ── Call Notes ───────────────────────────────────────────────────────────
    if (callNotes) {
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text('Call Notes');
      doc.moveDown(0.3);
      const notesText = typeof callNotes === 'string' ? callNotes : (callNotes.text || callNotes.value || JSON.stringify(callNotes));
      doc.fontSize(11).fillColor('#374151').font('Helvetica').text(notesText, { width: W });
      doc.moveDown(0.8);
    }

    // ── Transcript ───────────────────────────────────────────────────────────
    const transcriptArr = Array.isArray(transcript) ? transcript : [];
    if (transcriptArr.length) {
      doc.rect(50, doc.y, W, 1).fill('#E5E7EB');
      doc.moveDown(0.8);
      transcriptArr.forEach(seg => {
        const speaker = speakerName(seg);
        const text    = seg.text || seg.value || seg.transcript || '';
        const ts      = fmtTs(seg.startTime !== undefined ? seg.startTime
                              : (seg.startTimeMs !== undefined ? seg.startTimeMs / 1000 : undefined));
        const role    = getSpeakerRole(speaker);
        const col     = ROLE_COLORS[role] || ROLE_COLORS.agent;
        const label   = role.charAt(0).toUpperCase() + role.slice(1);

        if (doc.y > doc.page.height - 120) doc.addPage();
        const rowY = doc.y;

        // Role badge
        doc.roundedRect(50, rowY, 46, 14, 7).fill(col.bg);
        doc.fontSize(7).fillColor(col.text).font('Helvetica-Bold')
           .text(label.toUpperCase(), 50, rowY + 3, { width: 46, align: 'center', lineBreak: false });

        // Speaker name
        doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold')
           .text(speaker, 102, rowY + 1, { width: W - 52 - 55, lineBreak: false });

        // Timestamp
        if (ts) {
          doc.fontSize(10).fillColor('#6B7280').font('Helvetica')
             .text(ts, 50, rowY + 1, { width: W, align: 'right', lineBreak: false });
        }

        // Utterance text
        doc.fontSize(11).fillColor('#374151').font('Helvetica')
           .text(text, 50, rowY + 18, { width: W });
        doc.moveDown(0.5);
      });
    } else {
      // No transcript — note it
      doc.fontSize(11).fillColor('#9CA3AF').font('Helvetica').text('No transcript available for this recording.', { width: W });
    }

    doc.end();
  });
}

// ─── Resolve the agent name from a call record ───────────────────────────
function resolveAgentName(call) {
  const info = call.callInfo || call;
  // Prefer the pre-resolved extension field added in fetchAllInsights
  if (info.extension) return info.extension;
  // Fall back: inbound = to.name, outbound = from.name
  if (info.direction === 'Outbound') {
    return (info.from && info.from.name) ? info.from.name : resolveParty(info.from);
  }
  return (info.to && info.to.name) ? info.to.name : resolveParty(info.to);
}

// ─── Upload calls to SharePoint organised by agent folder ──────────────────
// Folder structure:
//   <sp_folder_path>/<Agent Name>/<YYYY-MM-DD HH-MM-SS Upload>/
//       YYYYMMDD_HHMM_from_X_to_Y.txt
//       YYYYMMDD_HHMM_from_X_to_Y.txt
//       ...
async function uploadToSharePointByAgent(calls) {
  const config = getConfig();
  const { sp_site_id, sp_drive_id, sp_folder_path } = config;
  if (!sp_site_id) throw new Error('SharePoint Site ID not configured. Go to Settings → SharePoint.');

  const token = await getGraphToken();

  // Build upload timestamp once for all files in this batch
  const now = new Date();
  const uploadTs = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const baseFolder = (sp_folder_path || '/RingSense Exports').replace(/\/+$/, '');

  // Group calls by agent name
  const byAgent = {};
  for (const call of calls) {
    const agent = resolveAgentName(call) || 'Unknown Agent';
    if (!byAgent[agent]) byAgent[agent] = [];
    byAgent[agent].push(call);
  }

  const uploaded = [];
  const errors   = [];

  for (const [agent, agentCalls] of Object.entries(byAgent)) {
    const safeAgent = sanitizeForFilename(agent).replace(/_+/g, ' ').trim() || 'Unknown_Agent';
    // Path: BaseFolder / Agent Name / 2026-04-22 14-35-00 Upload
    const folderPath = `${baseFolder}/${safeAgent}/${uploadTs} Upload`;

    for (const call of agentCalls) {
      const filename = buildCallFilename(call);
      const buffer = await formatCallAsPdf(call);
      try {
        const result = await _uploadBuffer(token, sp_site_id, sp_drive_id, folderPath, filename, buffer, 'application/pdf');
        uploaded.push({ agent, filename, webUrl: result.webUrl });
        console.log(`[SHAREPOINT] Uploaded: ${folderPath}/${filename}`);
      } catch (err) {
        errors.push({ agent, filename, error: err.message });
        console.error(`[SHAREPOINT] Failed: ${folderPath}/${filename} — ${err.message}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    recordCount: uploaded.length,
    errorCount: errors.length,
    agentCount: Object.keys(byAgent).length,
    uploadTimestamp: uploadTs,
    uploaded,
    errors,
    format: 'agent_folders',
  };
}

// ─── Get Graph API access token using client credentials ─────────────────────
async function getGraphToken() {
  const config = getConfig();
  const tenantId     = config.sp_tenant_id     || config.sso_tenant_id;
  const clientId     = config.sp_client_id     || config.sso_client_id;
  const clientSecret = config.sp_client_secret || config.sso_client_secret;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('SharePoint not configured. Set tenant ID, client ID, and client secret in Settings → SharePoint.');
  }

  // Return cached token if still valid
  const cachedToken  = config.sp_graph_token;
  const cachedExpiry = parseInt(config.sp_graph_token_expiry || '0', 10);
  if (cachedToken && cachedExpiry > Date.now() + 60000) {
    return cachedToken;
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         'https://graph.microsoft.com/.default',
      grant_type:    'client_credentials',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph auth failed: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  setConfig({
    sp_graph_token:        data.access_token,
    sp_graph_token_expiry: String(Date.now() + data.expires_in * 1000),
  });

  return data.access_token;
}

// ─── Upload a raw buffer to a SharePoint path ─────────────────────────────────
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
  uploadToSharePointByAgent,
  testSharePointConnection,
  listSites,
  listDrives,
  lookupSiteByUrl,
  debugGraphAccess,
};

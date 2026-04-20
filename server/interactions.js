const fs = require('fs');
const path = require('path');

const INTERACTIONS_PATH = path.join(__dirname, '..', 'data', 'interactions.json');

function ensureDir() {
  const dir = path.dirname(INTERACTIONS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function loadInteractions() {
  ensureDir();
  if (!fs.existsSync(INTERACTIONS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(INTERACTIONS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveInteractions(data) {
  ensureDir();
  fs.writeFileSync(INTERACTIONS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Store an interaction from a RingSense webhook/WebSocket event
function storeInteraction(event) {
  const interactions = loadInteractions();
  const body = event.body || event;

  // Build a normalized record
  const record = {
    id: body.sourceRecordId || body.sourceSessionId || `evt-${Date.now()}`,
    domain: body.domain || 'rcx',
    sourceRecordId: body.sourceRecordId,
    sourceSessionId: body.sourceSessionId,
    title: body.title || 'Unknown Call',
    callDirection: body.callDirection || null,
    ownerExtensionId: body.ownerExtensionId || null,
    recordingDurationMs: body.recordingDurationMs || null,
    recordingStartTime: body.recordingStartTime || null,
    creationTime: body.creationTime || new Date().toISOString(),
    lastModifiedTime: body.lastModifiedTime || new Date().toISOString(),
    speakerInfo: body.speakerInfo || [],
    rsRecordUri: body.rsRecordUri || null,
    // Store a subset of insights if they came with the event
    hasInsights: !!(body.insights),
    storedAt: new Date().toISOString(),
    source: 'webhook',
  };

  // Deduplicate by sourceRecordId
  const existing = interactions.findIndex(
    i => i.sourceRecordId && i.sourceRecordId === record.sourceRecordId
  );
  if (existing >= 0) {
    interactions[existing] = { ...interactions[existing], ...record };
  } else {
    interactions.unshift(record);
  }

  // Keep max 2000 records
  if (interactions.length > 2000) {
    interactions.length = 2000;
  }

  saveInteractions(interactions);
  return record;
}

// Get stored interactions, optionally filtered by date
function getInteractions(dateFrom, dateTo) {
  let interactions = loadInteractions();

  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    interactions = interactions.filter(i => {
      const t = new Date(i.recordingStartTime || i.creationTime).getTime();
      return t >= from;
    });
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    interactions = interactions.filter(i => {
      const t = new Date(i.recordingStartTime || i.creationTime).getTime();
      return t <= to;
    });
  }

  return interactions;
}

// Convert a PBX call log record into the same normalized format
function normalizePbxRecord(call) {
  return {
    id: call.recording?.id || call.id,
    domain: 'pbx',
    sourceRecordId: call.recording?.id,
    sourceSessionId: call.telephonySessionId || call.sessionId,
    title: `${call.direction || ''} call: ${call.from?.name || call.from?.phoneNumber || 'Unknown'} → ${call.to?.name || call.to?.phoneNumber || 'Unknown'}`,
    callDirection: call.direction || null,
    ownerExtensionId: call.extension?.id || null,
    recordingDurationMs: call.durationMs || (call.duration ? call.duration * 1000 : null),
    recordingStartTime: call.startTime || null,
    creationTime: call.startTime || null,
    lastModifiedTime: call.lastModifiedTime || null,
    speakerInfo: [],
    rsRecordUri: null,
    from: call.from || null,
    to: call.to || null,
    duration: call.duration || null,
    result: call.result || null,
    source: 'calllog',
  };
}

function getCount() {
  return loadInteractions().length;
}

module.exports = {
  storeInteraction,
  getInteractions,
  normalizePbxRecord,
  getCount,
};

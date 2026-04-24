const { getConfig } = require('./store');

// ─── Language detection — simple heuristic using common Spanish words ─────────
const SPANISH_INDICATORS = [
  'las ', 'los ', ' de ', ' el ', ' la ', ' en ', ' que ', ' es ', ' un ', ' una ',
  'para ', 'con ', 'por ', 'del ', ' no ', 'está', 'estás', 'somos', 'tengo',
  'grabadas', 'calidad', 'capacitación', 'cuelgue', 'ahora', 'llamadas', 'fines',
  'desea', 'grabado', 'favor', 'cuelgue', 'bienvenido', 'servicio', 'gracias',
];

function looksSpanish(text) {
  if (!text || text.length < 10) return false;
  const lower = text.toLowerCase();
  const hits = SPANISH_INDICATORS.filter(w => lower.includes(w)).length;
  return hits >= 2;
}

function looksNonEnglish(text) {
  return looksSpanish(text);
}

// ─── Translate text using Google Translate unofficial API (no key required) ───
async function translateToEnglish(text) {
  if (!text || !looksNonEnglish(text)) return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Response format: [[[translatedText, originalText], ...], ...]
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0]
        .filter(segment => Array.isArray(segment) && segment[0])
        .map(segment => segment[0])
        .join('');
      return translated || text;
    }
    return text;
  } catch (err) {
    console.warn(`[TRANSLATE] Google Translate failed: ${err.message} — using original text`);
    return text;
  }
}

// ─── Translate all text fields in an insights object ─────────────────────────
async function translateInsights(insightsObj) {
  if (!insightsObj) return insightsObj;

  const data = insightsObj.insights || insightsObj;

  // Check if any content looks non-English before making any API calls
  const sampleText = [
    ...(data.Transcript || []).slice(0, 3).map(t => t.text || ''),
    ...(Array.isArray(data.Summary)
      ? data.Summary.slice(0, 1).map(s => s.value || '')
      : [typeof data.Summary === 'string' ? data.Summary : '']),
  ].join(' ');

  if (!looksNonEnglish(sampleText)) {
    return insightsObj; // Already English — no translation needed
  }

  console.log('[TRANSLATE] Non-English content detected — translating to English via Google Translate');

  // Translate transcript utterances
  if (Array.isArray(data.Transcript)) {
    for (const seg of data.Transcript) {
      if (seg.text && looksNonEnglish(seg.text)) {
        seg.text = await translateToEnglish(seg.text);
      }
    }
  }

  // Translate Summary (array of {value} objects or plain string)
  if (Array.isArray(data.Summary)) {
    for (const item of data.Summary) {
      if (item.value && looksNonEnglish(item.value)) {
        item.value = await translateToEnglish(item.value);
      }
    }
  } else if (typeof data.Summary === 'string' && looksNonEnglish(data.Summary)) {
    data.Summary = await translateToEnglish(data.Summary);
  }

  // Translate BulletedSummary
  if (Array.isArray(data.BulletedSummary)) {
    for (const item of data.BulletedSummary) {
      if (item.value && looksNonEnglish(item.value)) {
        item.value = await translateToEnglish(item.value);
      }
    }
  }

  // Translate Highlights
  if (Array.isArray(data.Highlights)) {
    for (const item of data.Highlights) {
      if (item.value && looksNonEnglish(item.value)) {
        item.value = await translateToEnglish(item.value);
      }
    }
  }

  // Translate NextSteps
  if (Array.isArray(data.NextSteps)) {
    for (const item of data.NextSteps) {
      if (item.value && looksNonEnglish(item.value)) {
        item.value = await translateToEnglish(item.value);
      }
    }
  }

  // Translate CallNotes
  if (data.CallNotes) {
    const notesText = typeof data.CallNotes === 'string' ? data.CallNotes : (data.CallNotes.value || '');
    if (looksNonEnglish(notesText)) {
      if (typeof data.CallNotes === 'string') {
        data.CallNotes = await translateToEnglish(data.CallNotes);
      } else if (data.CallNotes.value) {
        data.CallNotes.value = await translateToEnglish(data.CallNotes.value);
      }
    }
  }

  return insightsObj;
}

module.exports = { translateInsights, translateToEnglish, looksNonEnglish };

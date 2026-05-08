// Pure HTML → structured prayer times parser.
//
// Used by:
//   - api/mosque-times.js    (server-side scrape pipeline)
//   - src/services/salahScraper.js (native fallback when no /api is reachable)
//
// Mosque websites are wildly heterogeneous — there is no universal
// schema. We use two layers:
//
//   (a) Table-aware: split HTML into <tr>/<td> rows BEFORE stripping
//       tags. For each row that contains a prayer name, pull every
//       time token out of the same row (Adhan + Iqamah usually live
//       side-by-side in adjacent <td>s). This handles ~70% of mosque
//       sites cleanly.
//
//   (b) Plain-text: flatten everything, find the line that mentions
//       a prayer name, look for time tokens within a small window.
//       Catches the rest where authors used <div>s or labelled rows
//       instead of tables.
//
// Returns { times, iqamah, confidence } where confidence is high
// (>=5 prayers found) / medium (>=3) / low (<3).

const PRAYER_KEYS = [
  { key: 'Fajr', synonyms: ['fajr', 'fajar', 'subh', 'subuh', 'subh sadiq'] },
  { key: 'Sunrise', synonyms: ['sunrise', 'shuruq', 'shurooq', 'ishraq'] },
  { key: 'Dhuhr', synonyms: ['dhuhr', 'duhr', 'zuhr', 'zhur', 'thuhr', 'luhr'] },
  { key: 'Asr', synonyms: ['asr', "'asr", 'asar'] },
  { key: 'Maghrib', synonyms: ['maghrib', 'magrib', 'maghreb'] },
  { key: 'Isha', synonyms: ["isha", "'isha", 'ishaa', 'esha', 'ishaa’'] },
  { key: 'Jummah', synonyms: ['jummah', 'jumuah', 'jumu’ah', 'jumua', 'jumma', 'jum‘ah', 'friday prayer', 'friday khutbah', 'jumah'] },
];

const TIME_RE = /(?:(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s?[ap]\.?m\.?)?|(?:1[0-2]|[1-9])[:.][0-5]\d\s?[ap]\.?m\.?)/gi;

const ENTITY_MAP = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

function decodeEntities(s) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY_MAP[m] || m)
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(parseInt(n, 10)); } catch { return _; }
    });
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normaliseTime(raw) {
  if (!raw) return null;
  let t = raw.trim().toUpperCase().replace(/\./g, ':').replace(/\s+/g, ' ');
  t = t.replace(/(\d)([AP]M)/, '$1 $2');
  return t;
}

function pickTimes(text, max = 3) {
  const matches = String(text).match(TIME_RE) || [];
  return matches.slice(0, max).map(normaliseTime);
}

function matchesAnyPrayer(text, synonyms) {
  const lower = text.toLowerCase();
  return synonyms.some((s) => {
    const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i');
    return re.test(lower);
  });
}

/**
 * Layer A: extract table rows, look at each row for a prayer name +
 * 1-2 time tokens. This preserves Adhan/Iqamah column ordering.
 */
function extractFromRows(html) {
  // Split into rows BEFORE stripping tags so we keep the row boundary.
  const rowChunks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .split(/<\/?(?:tr|li|p|h[1-6]|section|article|div)[^>]*>/i);

  const times = {};
  const iqamah = {};

  for (const chunk of rowChunks) {
    const text = decodeEntities(stripTags(chunk));
    if (!text) continue;
    for (const { key, synonyms } of PRAYER_KEYS) {
      if (!matchesAnyPrayer(text, synonyms)) continue;
      const tokens = pickTimes(text, 3);
      if (tokens.length === 0) continue;
      // Skip rows that look like header rows ("Prayer | Begins | Iqamah")
      if (tokens.length === 0) continue;
      // Pick the FIRST time token as Adhan; second as Iqamah if present.
      // Don't overwrite a previously-found higher-confidence value.
      if (!times[key]) times[key] = tokens[0];
      if (tokens[1] && !iqamah[key]) iqamah[key] = tokens[1];
    }
  }
  return { times, iqamah };
}

/**
 * Layer B: full-text fallback for sites that don't use tables.
 */
function extractFromText(html) {
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<\/?(?:tr|td|th|li|p|div|br|h[1-6]|table|tbody|thead|section)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const times = {};
  const iqamah = {};

  for (const { key, synonyms } of PRAYER_KEYS) {
    let foundIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (matchesAnyPrayer(lines[i], synonyms)) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx < 0) continue;
    // Window: matched line + up to 2 lines after to cover split <td>s.
    const window = lines.slice(foundIdx, Math.min(lines.length, foundIdx + 3)).join(' ');
    const tokens = pickTimes(window, 3);
    if (tokens.length === 0) continue;
    if (!times[key]) times[key] = tokens[0];
    if (tokens[1] && !iqamah[key]) iqamah[key] = tokens[1];
  }
  return { times, iqamah };
}

export function parsePrayerTimesFromHtml(html) {
  const a = extractFromRows(html);
  const b = extractFromText(html);

  // Merge: prefer row-level results (more reliable), backfill from text.
  const times = { ...b.times, ...a.times };
  const iqamah = { ...b.iqamah, ...a.iqamah };

  const filledKeys = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].filter((k) => times[k]);
  let confidence = 'low';
  if (filledKeys.length >= 5) confidence = 'high';
  else if (filledKeys.length >= 3) confidence = 'medium';

  return { times, iqamah, confidence };
}

export const __test__ = { PRAYER_KEYS, TIME_RE, normaliseTime, pickTimes, extractFromRows, extractFromText };

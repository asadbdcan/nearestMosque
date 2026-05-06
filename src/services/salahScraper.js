import { Platform } from 'react-native';

/**
 * Best-effort scraper that extracts Salah (prayer) times from a mosque
 * website's HTML. Mosque sites are extremely heterogeneous — there is no
 * universal schema — so this uses keyword + proximity heuristics:
 *
 *   1. Fetch HTML (via the mosque website URL).
 *   2. Strip scripts/styles, decode entities, collapse whitespace.
 *   3. For each prayer name, scan the cleaned text for the nearest time
 *      token (e.g. "5:14", "5:14 AM", "17:30") within a reasonable window.
 *   4. Pick the first plausible Iqamah/Jamaat time, falling back to Adhan.
 *
 * Returns:
 *   {
 *     times: { Fajr: "5:14 AM", Dhuhr: "1:30 PM", ... },
 *     iqamah: { ... }   // when a separate iqamah column was detected
 *     source: "https://...",
 *     confidence: "high" | "medium" | "low"
 *   }
 *
 * Web note: most mosque websites don't send CORS headers, so direct
 * browser fetches fail. On `Platform.OS === 'web'` we route through a
 * public CORS proxy. On native (iOS/Android) the fetch goes direct.
 */

// Public CORS relay used only when running in a browser (Expo web).
// Override at build time with EXPO_PUBLIC_CORS_PROXY=https://your-proxy.example/?url=
const WEB_CORS_PROXY =
  process.env.EXPO_PUBLIC_CORS_PROXY || 'https://corsproxy.io/?';

function proxiedUrl(url) {
  if (Platform.OS !== 'web') return url;
  return `${WEB_CORS_PROXY}${encodeURIComponent(url)}`;
}

const PRAYER_KEYS = [
  { key: 'Fajr', synonyms: ['fajr', 'fajar', 'subh', 'subuh', 'subh sadiq'] },
  { key: 'Sunrise', synonyms: ['sunrise', 'shuruq', 'shurooq', 'ishraq'] },
  { key: 'Dhuhr', synonyms: ['dhuhr', 'duhr', 'zuhr', 'zhur', 'thuhr', 'luhr'] },
  { key: 'Asr', synonyms: ['asr', "'asr", 'asar'] },
  { key: 'Maghrib', synonyms: ['maghrib', 'magrib', 'maghreb'] },
  { key: 'Isha', synonyms: ['isha', "'isha", 'ishaa', 'esha'] },
  { key: 'Jummah', synonyms: ['jummah', 'jumuah', 'jumu’ah', 'jumua', 'jumma', 'jum‘ah', 'friday prayer', 'friday khutbah'] },
];

const TIME_RE = /(?:(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s?[ap]\.?m\.?)?|(?:1[0-2]|[1-9])[:.][0-5]\d\s?[ap]\.?m\.?)/gi;

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY_MAP[m] || m)
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(parseInt(n, 10)); } catch { return _; }
    });
}

export function stripHtml(html) {
  return decodeEntities(
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
}

function normaliseTime(raw) {
  if (!raw) return null;
  let t = raw.trim().toUpperCase().replace(/\./g, ':').replace(/\s+/g, ' ');
  // Collapse "5:14AM" -> "5:14 AM"
  t = t.replace(/(\d)([AP]M)/, '$1 $2');
  // Some sites use 24h without meridiem; keep as-is.
  return t;
}

function findPrayerLine(lines, synonyms) {
  const re = new RegExp(`\\b(?:${synonyms.join('|')})\\b`, 'i');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return { idx: i, line: lines[i] };
  }
  return null;
}

function pickTimesFromLine(line, max = 3) {
  const matches = line.match(TIME_RE) || [];
  return matches.slice(0, max).map(normaliseTime);
}

export function parseSalahTimes(html) {
  const text = stripHtml(html);
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const times = {};
  const iqamah = {};
  let hits = 0;

  for (const { key, synonyms } of PRAYER_KEYS) {
    const found = findPrayerLine(lines, synonyms);
    if (!found) continue;

    // Look at the matching line and the next 1–2 lines (some sites split
    // the prayer name and its time across <td>s).
    const window = lines.slice(found.idx, Math.min(lines.length, found.idx + 3)).join(' ');
    const candidates = pickTimesFromLine(window, 3);
    if (candidates.length === 0) continue;

    // Heuristic: when two times appear on the same row, the first is usually
    // Adhan (Begins) and the second is Iqamah (Jamaat).
    times[key] = candidates[0];
    if (candidates[1]) iqamah[key] = candidates[1];
    hits += 1;
  }

  let confidence = 'low';
  if (hits >= 5) confidence = 'high';
  else if (hits >= 3) confidence = 'medium';

  return { times, iqamah, confidence };
}

/**
 * Fetch a mosque website and extract its Salah times.
 *
 *   url  – mosque website URL (from Google Place Details).
 */
export async function fetchSalahTimes(url) {
  if (!url) throw new Error('This mosque has no website on file, so we cannot fetch its prayer times.');

  let res;
  try {
    res = await fetch(proxiedUrl(url), {
      headers: {
        // User-Agent is ignored on web (browsers forbid setting it),
        // honoured on native.
        'User-Agent': 'NearestMosqueApp/1.0 (+https://example.com)',
        Accept: 'text/html,*/*',
      },
    });
  } catch (e) {
    const tip =
      Platform.OS === 'web'
        ? ' If this happens repeatedly on web, set EXPO_PUBLIC_CORS_PROXY to your own proxy.'
        : '';
    throw new Error(`Could not reach the mosque website (${e.message}).${tip}`);
  }

  if (!res.ok) {
    throw new Error(`Mosque website returned ${res.status}.`);
  }

  const html = await res.text();
  const parsed = parseSalahTimes(html);
  return { ...parsed, source: url };
}

// Exported for testing in isolation.
export const __test__ = { PRAYER_KEYS, TIME_RE, normaliseTime };

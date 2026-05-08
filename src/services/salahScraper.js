import { Platform } from 'react-native';

/**
 * Mosque-website prayer-time scraper (client side).
 *
 * On web, calls /api/mosque-times — a Vercel serverless function that
 * does a multi-step scrape on the server:
 *
 *   1. fetches the mosque's main page
 *   2. detects embedded prayer-time widget iframes (Masjidal/Athan+,
 *      Mawaqit, IslamicFinder, MasjidiApp, DeenLocator) and follows them
 *   3. tries common subpaths like /prayer-times, /timetable, /timings
 *   4. returns the highest-confidence result it found
 *
 * On native (iOS/Android) we run the same logic locally — no CORS to
 * worry about and no Vercel function to call. To keep the bundle small
 * we use a slimmed-down sequential variant.
 *
 * Returns:
 *   {
 *     times:       { Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha, Jummah },
 *     iqamah:      { ... },                         // when 2nd column existed
 *     confidence:  'high' | 'medium' | 'low',
 *     source:      'https://…',                     // exact URL we parsed
 *     sourceType:  'main' | 'widget' | 'subpath',
 *     attempts:    [...]                            // diagnostic, web only
 *   }
 */

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function fetchSalahTimes(mosqueWebsiteUrl) {
  if (!mosqueWebsiteUrl) {
    throw new Error(
      "This mosque does not have a website on file, so we can't fetch its prayer times."
    );
  }

  if (Platform.OS === 'web') {
    return fetchViaServer(mosqueWebsiteUrl);
  }
  return fetchOnNative(mosqueWebsiteUrl);
}

// ---------------------------------------------------------------------------
// Web — call the Vercel serverless function
// ---------------------------------------------------------------------------

async function fetchViaServer(url) {
  const endpoint = `/api/mosque-times?url=${encodeURIComponent(url)}`;
  let res;
  try {
    res = await fetch(endpoint);
  } catch (e) {
    throw new Error(`Could not reach the prayer-times service (${e.message}).`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error || j.detail || '';
      if (Array.isArray(j.attempts) && j.attempts.length) {
        const failures = j.attempts
          .filter((a) => !a.ok)
          .map((a) => `${a.url}: ${a.error || 'failed'}`)
          .slice(0, 3)
          .join('; ');
        if (failures) detail += ` Tried: ${failures}`;
      }
    } catch {}
    throw new Error(
      `Could not read the mosque website (server returned ${res.status}). ${detail}`.trim()
    );
  }

  const data = await res.json();
  if (!data || (Object.keys(data.times || {}).length === 0)) {
    throw new Error(
      "We couldn't find a prayer-times section on this mosque's website."
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// Native — same multi-step logic, run locally
// ---------------------------------------------------------------------------

const KNOWN_WIDGET_HOSTS = [
  'timing.athanplus.com',
  'mawaqit.net',
  'mosqueoftheworld.com',
  'masjidiapp.com',
  'api.masjidiapp.com',
  'islamicfinder.org',
  'www.islamicfinder.org',
  'deenlocator.com',
  'salahtimes.com',
];

const COMMON_SUBPATHS = [
  '/prayer-times',
  '/prayer-time',
  '/salah-times',
  '/timetable',
  '/timings',
  '/jamaat-times',
  '/iqamah-times',
];

async function fetchOnNative(mainUrl) {
  // Local copy of the parser — duplicated rather than shared so the
  // server-side `api/_lib` module never gets bundled into the React
  // Native build (Metro can choke on `import.meta`-style ESM).
  const { parsePrayerTimesFromHtml } = nativeParser();

  async function fetchHtml(u) {
    const r = await fetch(u, {
      headers: {
        'User-Agent': 'NearestMosqueApp/1.0',
        Accept: 'text/html,*/*',
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }

  const attempts = [];
  const isAcceptable = (p) => p && p.confidence !== 'low';
  const rank = (c) => (c === 'high' ? 3 : c === 'medium' ? 2 : 1);
  const countTimes = (p) => Object.keys(p?.times || {}).length;
  const better = (a, b) =>
    !b || rank(a.confidence) > rank(b.confidence) || countTimes(a) > countTimes(b);

  let best = null;
  let mainHtml;
  try {
    mainHtml = await fetchHtml(mainUrl);
    const parsed = parsePrayerTimesFromHtml(mainHtml);
    attempts.push({ kind: 'main', url: mainUrl, ok: true, ...parsed });
    best = { ...parsed, source: mainUrl, sourceType: 'main' };
    if (isAcceptable(parsed)) return { ...best, attempts };
  } catch (e) {
    attempts.push({ kind: 'main', url: mainUrl, ok: false, error: e.message });
  }

  // Widget iframes
  if (mainHtml) {
    const widgets = detectWidgetIframes(mainHtml, mainUrl);
    for (const w of widgets) {
      try {
        const html = await fetchHtml(w);
        const parsed = parsePrayerTimesFromHtml(html);
        attempts.push({ kind: 'widget', url: w, ok: true, ...parsed });
        const cand = { ...parsed, source: w, sourceType: 'widget' };
        if (better(cand, best)) best = cand;
        if (isAcceptable(parsed)) return { ...best, attempts };
      } catch (e) {
        attempts.push({ kind: 'widget', url: w, ok: false, error: e.message });
      }
    }
  }

  // Common subpaths (sequential on native to be gentle on quotas)
  let origin;
  try { origin = new URL(mainUrl).origin; } catch {}
  if (origin) {
    for (const path of COMMON_SUBPATHS) {
      const u = origin + path;
      try {
        const html = await fetchHtml(u);
        const parsed = parsePrayerTimesFromHtml(html);
        attempts.push({ kind: 'subpath', url: u, ok: true, ...parsed });
        const cand = { ...parsed, source: u, sourceType: 'subpath' };
        if (better(cand, best)) best = cand;
        if (isAcceptable(parsed)) return { ...best, attempts };
      } catch {
        // 404s here are normal — most subpaths won't exist. Skip silently.
      }
    }
  }

  if (!best || countTimes(best) === 0) {
    throw new Error(
      "We couldn't find a prayer-times section on this mosque's website."
    );
  }
  return { ...best, attempts };
}

function detectWidgetIframes(html, baseUrl) {
  const re = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    let abs;
    try { abs = new URL(m[1], baseUrl).toString(); } catch { continue; }
    let host;
    try { host = new URL(abs).hostname.toLowerCase(); } catch { continue; }
    if (KNOWN_WIDGET_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
      out.push(abs);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Native parser (kept inline so Metro doesn't try to bundle api/_lib)
// ---------------------------------------------------------------------------

function nativeParser() {
  const PRAYER_KEYS = [
    { key: 'Fajr', synonyms: ['fajr', 'fajar', 'subh', 'subuh'] },
    { key: 'Sunrise', synonyms: ['sunrise', 'shuruq', 'shurooq', 'ishraq'] },
    { key: 'Dhuhr', synonyms: ['dhuhr', 'duhr', 'zuhr', 'zhur', 'thuhr', 'luhr'] },
    { key: 'Asr', synonyms: ['asr', "'asr", 'asar'] },
    { key: 'Maghrib', synonyms: ['maghrib', 'magrib', 'maghreb'] },
    { key: 'Isha', synonyms: ['isha', "'isha", 'ishaa', 'esha'] },
    { key: 'Jummah', synonyms: ['jummah', 'jumuah', 'jumua', 'jumma', 'jumah', 'friday prayer'] },
  ];
  const TIME_RE = /(?:(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s?[ap]\.?m\.?)?|(?:1[0-2]|[1-9])[:.][0-5]\d\s?[ap]\.?m\.?)/gi;
  const ENT = { '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&nbsp;':' ' };
  const decodeEntities = (s) =>
    s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENT[m] || m)
     .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n,10)); } catch { return _; } });
  const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const normaliseTime = (raw) => {
    if (!raw) return null;
    let t = raw.trim().toUpperCase().replace(/\./g, ':').replace(/\s+/g, ' ');
    return t.replace(/(\d)([AP]M)/, '$1 $2');
  };
  const pickTimes = (text, max = 3) => (String(text).match(TIME_RE) || []).slice(0, max).map(normaliseTime);
  const matchesAnyPrayer = (text, syns) => {
    const lower = text.toLowerCase();
    return syns.some((s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(lower));
  };

  function extractFromRows(html) {
    const chunks = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .split(/<\/?(?:tr|li|p|h[1-6]|section|article|div)[^>]*>/i);
    const times = {}, iqamah = {};
    for (const chunk of chunks) {
      const text = decodeEntities(stripTags(chunk));
      if (!text) continue;
      for (const { key, synonyms } of PRAYER_KEYS) {
        if (!matchesAnyPrayer(text, synonyms)) continue;
        const tokens = pickTimes(text, 3);
        if (!tokens.length) continue;
        if (!times[key]) times[key] = tokens[0];
        if (tokens[1] && !iqamah[key]) iqamah[key] = tokens[1];
      }
    }
    return { times, iqamah };
  }

  function extractFromText(html) {
    const text = decodeEntities(
      html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<\/?(?:tr|td|th|li|p|div|br|h[1-6]|table|tbody|thead|section)[^>]*>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
    ).replace(/[\t\r ]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const times = {}, iqamah = {};
    for (const { key, synonyms } of PRAYER_KEYS) {
      let idx = -1;
      for (let i = 0; i < lines.length; i++) if (matchesAnyPrayer(lines[i], synonyms)) { idx = i; break; }
      if (idx < 0) continue;
      const window = lines.slice(idx, Math.min(lines.length, idx + 3)).join(' ');
      const tokens = pickTimes(window, 3);
      if (!tokens.length) continue;
      if (!times[key]) times[key] = tokens[0];
      if (tokens[1] && !iqamah[key]) iqamah[key] = tokens[1];
    }
    return { times, iqamah };
  }

  function parsePrayerTimesFromHtml(html) {
    const a = extractFromRows(html);
    const b = extractFromText(html);
    const times = { ...b.times, ...a.times };
    const iqamah = { ...b.iqamah, ...a.iqamah };
    const filled = ['Fajr','Dhuhr','Asr','Maghrib','Isha'].filter((k) => times[k]);
    let confidence = 'low';
    if (filled.length >= 5) confidence = 'high';
    else if (filled.length >= 3) confidence = 'medium';
    return { times, iqamah, confidence };
  }

  return { parsePrayerTimesFromHtml };
}

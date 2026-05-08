// Vercel serverless function: comprehensive mosque prayer-times scraper.
//
// Endpoint: GET /api/mosque-times?url=<mosque-website>
//
// Strategy (in order, picks the first result whose confidence is "high"
// or "medium", else returns the best-effort low result with diagnostics):
//
//   1. Fetch the mosque's main page HTML and parse it.
//   2. Look for embedded prayer-time widgets — Masjidal/Athan+
//      (timing.athanplus.com), Mawaqit (mawaqit.net), MasjidiApp,
//      IslamicFinder, DeenLocator. If found, fetch the widget URL
//      directly and parse — these widgets have well-structured tables.
//   3. Try common subpaths on the same origin: /prayer-times,
//      /salah-times, /timetable, /timings, /prayer-timetable,
//      /jamaat-times, /jamat-times.
//
// Returns { times, iqamah, confidence, source, sourceType, attempts[] }.
import { parsePrayerTimesFromHtml } from './_lib/parsePrayerHtml.js';

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1.5 * 1024 * 1024;

const COMMON_SUBPATHS = [
  '/prayer-times',
  '/prayer-time',
  '/salah-times',
  '/salat-times',
  '/timetable',
  '/timings',
  '/prayer-timetable',
  '/jamaat-times',
  '/jamat-times',
  '/namaz-times',
  '/iqamah-times',
  '/iqama-times',
  '/prayer',
  '/salah',
];

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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; NearestMosqueBot/1.0; +https://nearest-mosque.vercel.app)',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en;q=0.9',
    },
    signal: AbortSignal.timeout?.(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  // Stream cap to avoid pulling down massive pages.
  const reader = res.body?.getReader?.();
  if (!reader) return res.text();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) break;
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return html;
}

function safeUrl(maybeUrl, base) {
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

/**
 * Scan the page HTML for known prayer-time widget iframes and return
 * the (absolute) widget URL if present.
 */
function detectWidgetIframes(html, baseUrl) {
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const found = [];
  let m;
  while ((m = iframeRe.exec(html))) {
    const abs = safeUrl(m[1], baseUrl);
    if (!abs) continue;
    let host;
    try { host = new URL(abs).hostname.toLowerCase(); } catch { continue; }
    if (KNOWN_WIDGET_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
      found.push(abs);
    }
  }
  return found;
}

function confidenceRank(c) {
  return c === 'high' ? 3 : c === 'medium' ? 2 : c === 'low' ? 1 : 0;
}
function countTimes(parsed) {
  return Object.keys(parsed?.times || {}).length;
}

async function tryFetchAndParse(url) {
  try {
    const html = await fetchText(url);
    const parsed = parsePrayerTimesFromHtml(html);
    return { url, ok: true, parsed, html };
  } catch (e) {
    return { url, ok: false, error: e.message || String(e) };
  }
}

function isAcceptable(parsed) {
  return parsed && parsed.confidence !== 'low';
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const target = req.query?.url;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }
  let mainUrl;
  try {
    mainUrl = new URL(target).toString();
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const attempts = [];

  // 1. Main page.
  const mainAttempt = await tryFetchAndParse(mainUrl);
  attempts.push(summarise(mainAttempt, 'main'));

  let best = null;
  if (mainAttempt.ok) {
    best = { ...mainAttempt.parsed, source: mainUrl, sourceType: 'main' };
    if (isAcceptable(mainAttempt.parsed)) {
      return respond(res, best, attempts);
    }
  }

  // 2. Look for widget iframes in the main page HTML and try them.
  if (mainAttempt.ok) {
    const widgets = detectWidgetIframes(mainAttempt.html, mainUrl);
    if (widgets.length > 0) {
      const widgetResults = await Promise.allSettled(widgets.map(tryFetchAndParse));
      for (const r of widgetResults) {
        if (r.status !== 'fulfilled') continue;
        const v = r.value;
        attempts.push(summarise(v, 'widget'));
        if (!v.ok) continue;
        const candidate = { ...v.parsed, source: v.url, sourceType: 'widget' };
        if (isBetter(candidate, best)) best = candidate;
        if (isAcceptable(v.parsed)) {
          return respond(res, best, attempts);
        }
      }
    }
  }

  // 3. Try common subpaths in parallel.
  const origin = (() => {
    try { return new URL(mainUrl).origin; } catch { return null; }
  })();
  if (origin) {
    const subUrls = COMMON_SUBPATHS.map((p) => origin + p);
    const subResults = await Promise.allSettled(subUrls.map(tryFetchAndParse));
    for (const r of subResults) {
      if (r.status !== 'fulfilled') continue;
      const v = r.value;
      // Only record subpath attempts that returned 200 — the rest are noise.
      if (v.ok) attempts.push(summarise(v, 'subpath'));
      if (!v.ok) continue;
      const candidate = { ...v.parsed, source: v.url, sourceType: 'subpath' };
      if (isBetter(candidate, best)) best = candidate;
      if (isAcceptable(v.parsed)) {
        return respond(res, best, attempts);
      }
    }
  }

  if (!best) {
    return res.status(502).json({
      error: 'Could not fetch the mosque website.',
      attempts,
    });
  }
  return respond(res, best, attempts);
}

function isBetter(a, b) {
  if (!b) return true;
  const ra = confidenceRank(a.confidence);
  const rb = confidenceRank(b.confidence);
  if (ra !== rb) return ra > rb;
  return countTimes(a) > countTimes(b);
}

function summarise(attempt, kind) {
  const out = { kind, url: attempt.url, ok: !!attempt.ok };
  if (attempt.ok && attempt.parsed) {
    out.confidence = attempt.parsed.confidence;
    out.timesFound = countTimes(attempt.parsed);
  } else if (attempt.error) {
    out.error = attempt.error;
  }
  return out;
}

function respond(res, best, attempts) {
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.status(200).json({
    times: best.times || {},
    iqamah: best.iqamah || {},
    confidence: best.confidence,
    source: best.source,
    sourceType: best.sourceType,
    attempts,
  });
}

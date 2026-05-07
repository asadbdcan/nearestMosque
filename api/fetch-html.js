// Vercel serverless function: server-side HTML proxy.
//
// The Expo web build runs in the user's browser, so direct fetches to
// arbitrary mosque websites are blocked by CORS. This function fetches
// the URL server-side (where there is no CORS) and returns the HTML
// with permissive CORS headers, so the browser can read it.
//
// Endpoint: GET /api/fetch-html?url=<mosque-website>
// Response: text/html with Access-Control-Allow-Origin: *

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const PRIVATE_HOST_RE = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|localhost$)/i;

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
}

export default async function handler(req, res) {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const target = req.query?.url;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ error: 'Missing ?url= parameter' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Refuse anything that isn't plain http(s) or that points at a private
  // / loopback host — basic SSRF guardrails for a public function.
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    res.status(400).json({ error: 'Only http/https URLs are allowed' });
    return;
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    res.status(400).json({ error: 'Private hosts are not allowed' });
    return;
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      // Pretend to be a normal browser; some mosque sites 403 unknown UAs.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NearestMosqueBot/1.0; +https://nearest-mosque.vercel.app)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en;q=0.9',
      },
      redirect: 'follow',
      // 12s — Vercel hobby has a 10–15s function ceiling depending on plan.
      signal: AbortSignal.timeout?.(12000),
    });

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Upstream-Status', String(upstream.status));
    res.send(body);
  } catch (err) {
    res.status(502).json({
      error: 'Upstream fetch failed',
      detail: String(err && err.message ? err.message : err),
    });
  }
}

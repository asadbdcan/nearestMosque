// Vercel serverless function: find a mosque's real homepage via web search.
//
// We hit DuckDuckGo's HTML interface (no API key, no rate auth required),
// parse the result links, and pick the first one that doesn't look like
// a social profile, listing site, or news article.
//
//   GET /api/find-mosque-website?name=…&city=…&exclude=<known-fb-or-social-host>
//
// Returns:
//   { url, host, source: 'duckduckgo' }       — when something found
//   { url: null, candidates: [...] }          — when nothing matched the filter

const SOCIAL_HOSTS = new Set([
  'facebook.com', 'm.facebook.com', 'fb.com', 'fb.me', 'web.facebook.com',
  'instagram.com', 'instagr.am',
  'twitter.com', 'x.com', 'mobile.twitter.com',
  'youtube.com', 'youtu.be', 'm.youtube.com',
  'tiktok.com', 'vm.tiktok.com',
  'linktr.ee', 'beacons.ai', 'taplink.cc', 'lnk.bio',
  'pinterest.com', 'reddit.com', 'whatsapp.com', 'wa.me',
]);

// Listing/review/aggregator sites we don't want to use as a "website".
const LISTING_HOSTS = new Set([
  'google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'g.co',
  'yelp.com', 'yelp.co.uk', 'tripadvisor.com', 'tripadvisor.co.uk',
  'foursquare.com', 'wikipedia.org', 'en.wikipedia.org', 'wikimedia.org',
  'mapquest.com', 'bing.com', 'duckduckgo.com',
  'salaam.co.uk', 'muslimsinbritain.org',
  'islamicfinder.org', 'mawaqit.net', 'mymasjidal.com', 'masjidiapp.com',
]);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isSocialHost(host) {
  return SOCIAL_HOSTS.has(host) || [...SOCIAL_HOSTS].some((h) => host.endsWith('.' + h));
}
function isListingHost(host) {
  return LISTING_HOSTS.has(host) || [...LISTING_HOSTS].some((h) => host.endsWith('.' + h));
}

function decodeDdgRedirect(href) {
  // DuckDuckGo HTML wraps results in /l/?uddg=ENCODED — decode if present.
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    if (u.pathname.startsWith('/l/') && u.searchParams.get('uddg')) {
      return decodeURIComponent(u.searchParams.get('uddg'));
    }
    return u.toString();
  } catch {
    return null;
  }
}

function parseDdgResults(html) {
  // Each result is <a class="result__a" href="...">TEXT</a>
  const re = /<a\s+[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) && out.length < 25) {
    const href = decodeDdgRedirect(m[1]);
    if (!href) continue;
    out.push({ url: href, title: m[2].trim() });
  }
  return out;
}

async function searchDuckDuckGo(query) {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; NearestMosqueBot/1.0; +https://nearest-mosque.vercel.app)',
      Accept: 'text/html',
      'Accept-Language': 'en;q=0.9',
    },
    signal: AbortSignal.timeout?.(8000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
  const html = await res.text();
  return parseDdgResults(html);
}

function score(candidate, mosqueName) {
  // Higher = more likely to be the mosque's real website.
  const u = (() => { try { return new URL(candidate.url); } catch { return null; } })();
  if (!u) return -1;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  if (isSocialHost(host)) return -1;
  if (isListingHost(host)) return -1;

  let s = 0;
  // Reward mosque-related TLDs / hostnames.
  if (/\b(mosque|masjid|islamic|jamia|al)\b/i.test(host)) s += 6;
  if (/^(www\.)?[\w-]+\.(org|mosque)/.test(u.hostname)) s += 2;
  // Reward when mosque name fragments appear in host.
  const nameTokens = mosqueName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !['mosque', 'masjid', 'islamic', 'centre', 'center'].includes(t));
  for (const t of nameTokens) if (host.includes(t)) s += 4;
  // Reward title overlap.
  const titleLower = (candidate.title || '').toLowerCase();
  for (const t of nameTokens) if (titleLower.includes(t)) s += 1;
  // Penalise sub-paths that look like blog posts / forums.
  if (/\/(blog|forum|news|article|post)\b/i.test(u.pathname)) s -= 2;
  return s;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = (req.query.name || '').toString().trim();
  const city = (req.query.city || '').toString().trim();
  const exclude = (req.query.exclude || '').toString().toLowerCase();

  if (!name) return res.status(400).json({ error: 'Missing ?name= parameter' });

  const query = [name, city, 'mosque prayer times'].filter(Boolean).join(' ');

  let results;
  try {
    results = await searchDuckDuckGo(query);
  } catch (e) {
    return res.status(502).json({ error: 'Search failed', detail: e.message });
  }

  // Filter out the excluded host (whatever Google Places already gave us
  // and we're trying to replace) and obvious junk.
  const filtered = results
    .map((c) => ({ ...c, _host: hostOf(c.url) }))
    .filter((c) => c._host && !isSocialHost(c._host) && !isListingHost(c._host))
    .filter((c) => !exclude || !c._host.endsWith(exclude.replace(/^www\./, '')));

  // Score and pick the best.
  const ranked = filtered
    .map((c) => ({ ...c, _score: score(c, name) }))
    .filter((c) => c._score >= 2)
    .sort((a, b) => b._score - a._score);

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  if (ranked.length === 0) {
    return res.status(200).json({
      url: null,
      candidates: filtered.slice(0, 5).map((c) => ({ url: c.url, host: c._host, title: c.title })),
    });
  }

  const best = ranked[0];
  return res.status(200).json({
    url: best.url,
    host: best._host,
    title: best.title,
    score: best._score,
    source: 'duckduckgo',
    candidates: ranked.slice(0, 5).map((c) => ({ url: c.url, host: c._host, title: c.title, score: c._score })),
  });
}

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

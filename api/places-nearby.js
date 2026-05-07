// Vercel serverless function: Google Places Nearby Search proxy.
//
// Browsers can't reliably call Google's Places Web Service directly
// because it isn't designed for cross-origin use. This function does
// the call server-side and returns the JSON with permissive CORS
// headers. The Google API key is read from server-only env vars and
// never leaves the server.
//
// Endpoint: GET /api/places-nearby?lat=…&lng=…&radius=5000

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getKey() {
  // Prefer a server-only var; fall back to EXPO_PUBLIC_ for backwards
  // compatibility with the bundle-baked key.
  return (
    process.env.GOOGLE_PLACES_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ||
    ''
  );
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = Math.min(Math.max(parseInt(req.query.radius, 10) || 5000, 100), 50000);

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: 'Invalid lat/lng' });
    return;
  }

  const key = getKey();
  if (!key) {
    res.status(500).json({
      error: 'Server is not configured. Set GOOGLE_PLACES_KEY in Vercel env vars.',
    });
    return;
  }

  const url =
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
    `?location=${lat},${lng}` +
    `&radius=${radius}` +
    '&type=mosque' +
    '&keyword=mosque%20masjid%20islamic%20center' +
    `&key=${encodeURIComponent(key)}`;

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout?.(12000) });
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({
      error: 'Upstream Google Places call failed',
      detail: String(err && err.message ? err.message : err),
    });
  }
}

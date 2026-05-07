// Vercel serverless function: Google Place Details proxy.
//
// Endpoint: GET /api/place-details?placeId=…

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getKey() {
  return (
    process.env.GOOGLE_PLACES_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ||
    ''
  );
}

const FIELDS = [
  'name',
  'formatted_address',
  'formatted_phone_number',
  'international_phone_number',
  'website',
  'url',
  'opening_hours',
  'geometry',
  'rating',
  'user_ratings_total',
].join(',');

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

  const placeId = req.query.placeId;
  if (!placeId || typeof placeId !== 'string' || placeId.length > 200) {
    res.status(400).json({ error: 'Invalid placeId' });
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
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(FIELDS)}` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout?.(12000) });
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Place Details for a given mosque rarely changes; cache 1 hour at the edge.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({
      error: 'Upstream Google Place Details call failed',
      detail: String(err && err.message ? err.message : err),
    });
  }
}

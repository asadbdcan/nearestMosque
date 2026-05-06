import { distanceMeters } from './location';

/**
 * OpenStreetMap / Overpass API provider — completely free, no API key.
 *
 * Queries OSM for nodes/ways/relations tagged as Muslim places of worship
 * within a radius of the user's coordinates. Returns the same mosque shape
 * as the Google provider so screens don't need to care which one is active.
 *
 * Mosque shape:
 *   { id, provider:'osm', name, address, location, distance,
 *     website, phone, rating: null, openNow: null, openingHours: null,
 *     googleMapsUrl: null }
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

function buildQuery(coords, radius) {
  const { latitude: lat, longitude: lon } = coords;
  // Match BOTH the explicit "amenity=place_of_worship + religion=muslim"
  // tagging and the looser "building=mosque" tag some mappers use.
  return `
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
  way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
  relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
  node["building"="mosque"](around:${radius},${lat},${lon});
  way["building"="mosque"](around:${radius},${lat},${lon});
);
out center tags;
`.trim();
}

function buildAddress(tags) {
  const parts = [
    tags['addr:housename'],
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:postcode'],
  ].filter(Boolean);
  if (parts.length === 0) return tags['addr:full'] || '';
  return parts.join(', ');
}

function pickName(tags) {
  return (
    tags.name ||
    tags['name:en'] ||
    tags['alt_name'] ||
    tags['short_name'] ||
    tags.operator ||
    'Mosque'
  );
}

function pickWebsite(tags) {
  let url =
    tags['contact:website'] ||
    tags.website ||
    tags['contact:url'] ||
    tags.url ||
    null;
  if (!url) return null;
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

function pickPhone(tags) {
  return tags['contact:phone'] || tags.phone || null;
}

function elementToMosque(el, coords) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const location = { latitude: lat, longitude: lon };
  return {
    id: `osm:${el.type}/${el.id}`,
    provider: 'osm',
    placeId: null,
    osmType: el.type,
    osmId: el.id,
    name: pickName(tags),
    address: buildAddress(tags),
    location,
    distance: distanceMeters(coords, location),
    website: pickWebsite(tags),
    phone: pickPhone(tags),
    rating: null,
    ratingsTotal: null,
    openNow: null,
    openingHours: tags.opening_hours ? [tags.opening_hours] : null,
    googleMapsUrl: null,
  };
}

async function postOverpass(query) {
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) {
        lastErr = new Error(`${endpoint} returned ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(
    `Could not reach OpenStreetMap (Overpass). ${lastErr?.message || ''}`.trim()
  );
}

export async function findNearbyMosquesOSM(coords, { radius = 5000 } = {}) {
  const data = await postOverpass(buildQuery(coords, radius));
  const elements = Array.isArray(data?.elements) ? data.elements : [];

  // De-duplicate: an OSM "mosque" often appears as both a node and a way
  // (the building polygon + an amenity node inside it). Group by name +
  // approximate location and keep the closest one.
  const seen = new Map();
  for (const el of elements) {
    const m = elementToMosque(el, coords);
    if (!m) continue;
    const key = `${m.name.toLowerCase()}|${m.location.latitude.toFixed(4)}|${m.location.longitude.toFixed(4)}`;
    const prev = seen.get(key);
    if (!prev || m.distance < prev.distance) seen.set(key, m);
  }

  const list = Array.from(seen.values());
  list.sort((a, b) => a.distance - b.distance);
  return list;
}

/**
 * For OSM mosques the "details" object is already populated from the
 * initial search response — there is no second round-trip needed. This
 * helper just normalises the shape so MosqueDetailScreen can call it
 * uniformly regardless of provider.
 */
export async function getMosqueDetailsOSM(mosque) {
  return {
    name: mosque.name,
    address: mosque.address,
    phone: mosque.phone,
    website: mosque.website,
    googleMapsUrl: `https://www.openstreetmap.org/${mosque.osmType}/${mosque.osmId}`,
    rating: null,
    ratingsTotal: null,
    openingHours: mosque.openingHours,
    location: mosque.location,
  };
}

import Constants from 'expo-constants';
import { distanceMeters } from './location';
import { findNearbyMosquesOSM, getMosqueDetailsOSM } from './osm';

/**
 * Mosque provider router.
 *
 * If a Google Places API key is configured (app.json → expo.extra.googlePlacesApiKey,
 * or EXPO_PUBLIC_GOOGLE_PLACES_KEY), use Google for richer data (ratings,
 * Open-now status, formatted addresses, photos). Otherwise fall back to
 * OpenStreetMap / Overpass — completely free, no API key required.
 *
 * Both providers return objects with the same shape, so screens are
 * provider-agnostic.
 */

export function getApiKey() {
  const fromExtra =
    Constants.expoConfig?.extra?.googlePlacesApiKey ??
    Constants.manifest?.extra?.googlePlacesApiKey;
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
  const key = fromExtra || fromEnv;
  if (!key || typeof key !== 'string' || key.startsWith('REPLACE_')) return null;
  return key;
}

export function getActiveProvider() {
  return getApiKey() ? 'google' : 'osm';
}

// ---------------------------------------------------------------------------
// Google Places implementation
// ---------------------------------------------------------------------------

// How many of the nearest results to enrich with Place Details on a single
// search. Place Details is a separately-billed Google SKU, so we don't run
// it for every result — just the ones the user is most likely to look at.
const ENRICH_TOP_N = 12;

async function findNearbyMosquesGoogle(coords, { radius, enrichDetailsCount = ENRICH_TOP_N }) {
  const key = getApiKey();
  const url =
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
    `?location=${coords.latitude},${coords.longitude}` +
    `&radius=${radius}` +
    '&type=mosque' +
    '&keyword=mosque%20masjid%20islamic%20center' +
    `&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Places request failed (${res.status}).`);
  const data = await res.json();

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(data.error_message || 'Places API: request denied. Check your API key.');
  }
  if (data.status === 'OVER_QUERY_LIMIT') {
    throw new Error('Places API: over quota. Please try again later.');
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API: ${data.status}`);
  }

  const list = (data.results || []).map((p) => {
    const loc = {
      latitude: p.geometry?.location?.lat,
      longitude: p.geometry?.location?.lng,
    };
    return {
      id: p.place_id,
      provider: 'google',
      placeId: p.place_id,
      name: p.name,
      address: p.vicinity || p.formatted_address || '',
      location: loc,
      distance: loc.latitude ? distanceMeters(coords, loc) : Number.POSITIVE_INFINITY,
      website: null,             // populated by enrich step below
      phone: null,
      rating: p.rating ?? null,
      ratingsTotal: p.user_ratings_total ?? null,
      openNow: p.opening_hours?.open_now,
      openingHours: null,
      googleMapsUrl: null,
      detailsLoaded: false,
    };
  });
  list.sort((a, b) => a.distance - b.distance);

  // Enrich the top N nearest with Place Details (phone, website, full
  // address) in parallel so the Home list can show contact info.
  if (enrichDetailsCount > 0) {
    const enrichTargets = list.slice(0, enrichDetailsCount);
    await Promise.allSettled(
      enrichTargets.map(async (m) => {
        try {
          const d = await getMosqueDetailsGoogle(m);
          m.address = d.address || m.address;
          m.phone = d.phone || null;
          m.website = d.website || null;
          m.googleMapsUrl = d.googleMapsUrl || null;
          m.openingHours = d.openingHours || null;
          if (d.rating != null) m.rating = d.rating;
          if (d.ratingsTotal != null) m.ratingsTotal = d.ratingsTotal;
          m.detailsLoaded = true;
        } catch {
          // Best-effort enrichment — leave detailsLoaded false and let
          // the detail screen retry on demand.
        }
      })
    );
  }

  return list;
}

async function getMosqueDetailsGoogle(mosque) {
  const key = getApiKey();
  if (!mosque?.placeId) throw new Error('placeId is required for Google details.');

  const fields = [
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

  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(mosque.placeId)}` +
    `&fields=${fields}` +
    `&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Place details failed (${res.status}).`);
  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(data.error_message || `Place details: ${data.status}`);
  }
  const r = data.result || {};
  return {
    name: r.name,
    address: r.formatted_address,
    phone: r.formatted_phone_number || r.international_phone_number,
    website: r.website,
    googleMapsUrl: r.url,
    rating: r.rating ?? null,
    ratingsTotal: r.user_ratings_total ?? null,
    openingHours: r.opening_hours?.weekday_text,
    location: r.geometry?.location
      ? { latitude: r.geometry.location.lat, longitude: r.geometry.location.lng }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Public, provider-agnostic API
// ---------------------------------------------------------------------------

/**
 * Find nearby mosques. Uses Google if a key is configured, otherwise OSM.
 *
 *   coords                – { latitude, longitude }
 *   radius                – metres (default 5000)
 *   enrichDetailsCount    – Google only: how many top results to enrich
 *                           with Place Details (phone, website). Default 12.
 *                           Set to 0 to skip enrichment (cheaper, no contact
 *                           info on cards until you tap into a mosque).
 */
export async function findNearbyMosques(
  coords,
  { radius = 5000, enrichDetailsCount } = {}
) {
  if (getApiKey()) {
    return findNearbyMosquesGoogle(coords, { radius, enrichDetailsCount });
  }
  return findNearbyMosquesOSM(coords, { radius });
}

/**
 * Get extended details for a selected mosque. Accepts the mosque object
 * itself so the router can pick the right provider.
 */
export async function getMosqueDetails(mosque) {
  if (!mosque) throw new Error('mosque is required.');
  if (mosque.provider === 'osm') return getMosqueDetailsOSM(mosque);
  return getMosqueDetailsGoogle(mosque);
}

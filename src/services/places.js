import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { distanceMeters } from './location';
import { findNearbyMosquesOSM, getMosqueDetailsOSM } from './osm';
import { findOverrideWebsite } from '../data/mosqueWebsiteOverrides';

/**
 * Mosque provider router.
 *
 * Provider selection:
 *   - Google Places (preferred) — when an API key is configured, OR when
 *     running in the browser on a Vercel deploy that has a server-side
 *     GOOGLE_PLACES_KEY (the React app calls /api/places-* and never sees
 *     the key). On native (iOS/Android) we still need EXPO_PUBLIC_… so
 *     the key is in the bundle.
 *   - OpenStreetMap / Overpass — free fallback, no key required.
 *
 * Transport on web:
 *   The Google Places Web Service does not reliably support CORS, so the
 *   browser cannot call it directly. On `Platform.OS === 'web'` we route
 *   every Google call through the same-origin /api/places-nearby and
 *   /api/place-details Vercel functions defined in /api. This also keeps
 *   the API key fully server-side on the deployed web build.
 *
 * Both providers return identical mosque shapes.
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

/**
 * Whether to assume Google Places is available without checking for a
 * client-side key. On the web we ALWAYS try the same-origin /api proxy
 * first; if it returns 404 or 5xx we fall back to OSM. The proxy uses
 * the server-side GOOGLE_PLACES_KEY env var, which is invisible to the
 * browser bundle.
 */
function preferGoogleOnWeb() {
  return Platform.OS === 'web';
}

export function getActiveProvider() {
  if (getApiKey()) return 'google';
  if (preferGoogleOnWeb()) return 'google'; // optimistic — proxy will tell us
  return 'osm';
}

// ---------------------------------------------------------------------------
// Google Places — transport helpers (web vs native)
// ---------------------------------------------------------------------------

const ENRICH_TOP_N = 12;

async function callPlacesNearby({ coords, radius }) {
  if (Platform.OS === 'web') {
    const url =
      `/api/places-nearby?lat=${coords.latitude}&lng=${coords.longitude}&radius=${radius}`;
    const res = await fetch(url);
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j.error || j.detail || '';
      } catch {}
      throw new Error(
        `Server proxy returned ${res.status}.${detail ? ' ' + detail : ''}`
      );
    }
    return res.json();
  }

  // Native: call Google directly (no CORS in native fetch).
  const key = getApiKey();
  if (!key) throw new Error('Google Places API key is not configured.');
  const url =
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
    `?location=${coords.latitude},${coords.longitude}` +
    `&radius=${radius}` +
    '&type=mosque' +
    '&keyword=mosque%20masjid%20islamic%20center' +
    `&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Places request failed (${res.status}).`);
  return res.json();
}

async function callPlaceDetails(placeId) {
  if (Platform.OS === 'web') {
    const url = `/api/place-details?placeId=${encodeURIComponent(placeId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j.error || j.detail || '';
      } catch {}
      throw new Error(
        `Place Details proxy returned ${res.status}.${detail ? ' ' + detail : ''}`
      );
    }
    return res.json();
  }

  const key = getApiKey();
  if (!key) throw new Error('Google Places API key is not configured.');
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
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${fields}` +
    `&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Place details failed (${res.status}).`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Google Places — high-level
// ---------------------------------------------------------------------------

async function findNearbyMosquesGoogle(coords, { radius, enrichDetailsCount = ENRICH_TOP_N }) {
  const data = await callPlacesNearby({ coords, radius });

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(
      data.error_message ||
        'Places API: request denied. Verify the API key, enabled APIs, and referrer/IP restrictions.'
    );
  }
  if (data.status === 'OVER_QUERY_LIMIT') {
    throw new Error('Places API: over quota. Please try again later.');
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}`);
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
      website: null,
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
          // Leave detailsLoaded false; detail screen retries on demand.
        }
      })
    );
  }

  // Apply curated website overrides — runs AFTER Google enrichment so a
  // hand-picked URL trumps whatever Google had stored (often a Facebook
  // page or nothing at all).
  for (const m of list) {
    const override = findOverrideWebsite(m);
    if (override) {
      m.website = override;
      m.websiteOverride = true;
    }
  }

  return list;
}

async function getMosqueDetailsGoogle(mosque) {
  if (!mosque?.placeId) throw new Error('placeId is required for Google details.');

  const data = await callPlaceDetails(mosque.placeId);
  if (data.status !== 'OK') {
    throw new Error(data.error_message || `Place details: ${data.status}`);
  }
  const r = data.result || {};

  // Apply curated override on the details path too — covers the
  // detail-screen lookup for mosques that weren't in the top-N enrich set.
  const overrideForDetails = findOverrideWebsite({
    name: r.name || mosque.name,
    address: r.formatted_address || mosque.address,
  });

  return {
    name: r.name,
    address: r.formatted_address,
    phone: r.formatted_phone_number || r.international_phone_number,
    website: overrideForDetails || r.website,
    websiteOverride: !!overrideForDetails,
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
 * Find nearby mosques.
 *
 * Routing rules:
 *   - Native + key configured → Google direct.
 *   - Web (any deploy) → /api/places-nearby (server proxy). If the proxy
 *     responds with 500/404/etc. we fall through to OSM so the app keeps
 *     working when the env var isn't set up.
 *   - No key, native → OSM.
 */
export async function findNearbyMosques(
  coords,
  { radius = 5000, enrichDetailsCount } = {}
) {
  const tryGoogle = getApiKey() || preferGoogleOnWeb();
  if (tryGoogle) {
    try {
      return await findNearbyMosquesGoogle(coords, { radius, enrichDetailsCount });
    } catch (e) {
      // On web, the proxy may be missing or misconfigured. Fall back to
      // OSM rather than failing outright. We rethrow on native to make
      // misconfiguration loud during development.
      if (Platform.OS === 'web') {
        console.warn('[mosques] Google proxy failed, falling back to OSM:', e.message);
        return findNearbyMosquesOSM(coords, { radius });
      }
      throw e;
    }
  }
  return findNearbyMosquesOSM(coords, { radius });
}

/**
 * Get extended details for a selected mosque.
 */
export async function getMosqueDetails(mosque) {
  if (!mosque) throw new Error('mosque is required.');
  if (mosque.provider === 'osm') return getMosqueDetailsOSM(mosque);
  return getMosqueDetailsGoogle(mosque);
}

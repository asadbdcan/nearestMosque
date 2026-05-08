// Curated mosque-name → official-website map.
//
// Why this exists:
//   Google Places' "website" field is incomplete and frequently wrong:
//   many mosques registered a Facebook page instead of a real site,
//   and lots of mosques have a real site that Google has never indexed.
//   The DuckDuckGo search fallback helps but isn't perfect either.
//
// This file lets you pin specific mosques you've personally verified
// to known-good URLs. It's intentionally simple — match by a substring
// of the normalised mosque name (case-insensitive, punctuation-stripped),
// optionally narrowed by city or country if the same name appears in
// multiple places. The first matching entry wins.
//
// To add a mosque:
//   1. Find the exact name as it appears in Google (or OSM) — e.g.
//      "Baitul Aman Masjid".
//   2. Pick a unique fragment of that name as `nameMatches` (1-3
//      lowercase tokens are usually enough).
//   3. Add the verified `website` URL.
//   4. If the same name might collide with a different mosque in
//      another city, add a `location: { city, country }` filter.
//
// Format reference:
//   {
//     nameMatches: ['baitul aman'],          // any-of substring match
//     location:    { city: 'toronto' },      // optional, address contains
//     website:     'https://example.org',
//   }

export const MOSQUE_WEBSITE_OVERRIDES = [
  {
    nameMatches: ['baitul aman'],
    location: { city: 'toronto', country: 'canada' },
    website: 'https://danforthcommunitycenter.org',
    note: 'Danforth Islamic Centre / Baitul Aman Masjid — verified',
  },
  {
    nameMatches: ['baitul mukarram'],
    location: { country: 'canada' },
    website: 'https://bmis.ca/',
    note: 'Baitul Mukarram Islamic Society — verified',
  },
];

// ---------------------------------------------------------------------------

function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the override entry for a mosque, or null.
 *
 *   mosque – { name, address }
 */
export function findMosqueOverride(mosque) {
  if (!mosque?.name) return null;
  const name = normalise(mosque.name);
  const addr = normalise(mosque.address);

  for (const entry of MOSQUE_WEBSITE_OVERRIDES) {
    const nameHit = (entry.nameMatches || []).some((p) =>
      name.includes(normalise(p))
    );
    if (!nameHit) continue;

    if (entry.location) {
      const { city, country, region } = entry.location;
      if (city && !addr.includes(normalise(city))) continue;
      if (country && !addr.includes(normalise(country))) continue;
      if (region && !addr.includes(normalise(region))) continue;
    }
    return entry;
  }
  return null;
}

/**
 * Convenience: just the URL.
 */
export function findOverrideWebsite(mosque) {
  return findMosqueOverride(mosque)?.website || null;
}

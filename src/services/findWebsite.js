import { Platform } from 'react-native';

/**
 * Try to discover a mosque's real website via web search when Google
 * Places either has no website or only a social URL.
 *
 *   mosqueName   – e.g. "Masjid An-Noor"
 *   city         – e.g. "Dhaka" (parsed from address; pass empty string if unknown)
 *   excludeHost  – the host we're trying to replace (e.g. "facebook.com")
 *
 * Returns:
 *   { url, host, title, score } on success, OR
 *   { url: null, candidates: […] } when nothing matched
 *
 * Web only — uses the /api/find-mosque-website serverless function.
 * On native this returns null (we don't have a search transport baked in;
 * native users can run the same logic against any search backend later).
 */
export async function findRealWebsite({ mosqueName, city = '', excludeHost = '' } = {}) {
  if (!mosqueName) return { url: null, candidates: [] };
  if (Platform.OS !== 'web') return { url: null, candidates: [] };

  const params = new URLSearchParams({ name: mosqueName });
  if (city) params.set('city', city);
  if (excludeHost) params.set('exclude', excludeHost);

  let res;
  try {
    res = await fetch(`/api/find-mosque-website?${params.toString()}`);
  } catch (e) {
    throw new Error(`Could not search for the mosque's website (${e.message}).`);
  }
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.detail || j.error || ''; } catch {}
    throw new Error(`Website search returned ${res.status}.${detail ? ' ' + detail : ''}`);
  }
  return res.json();
}

/**
 * Attempt to extract a city / locality from a formatted address.
 * Heuristic: most Google "formatted_address" strings look like
 * "Street, Locality, Region, Country" — we pick the second comma chunk.
 */
export function cityFromAddress(address) {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3] || '';
  if (parts.length === 2) return parts[1] || '';
  return parts[0] || '';
}

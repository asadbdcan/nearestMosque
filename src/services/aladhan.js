/**
 * AlAdhan API — calculated prayer times by coordinates.
 *
 * AlAdhan (https://aladhan.com/prayer-times-api) is a free, key-less,
 * CORS-enabled service used by most prayer-time apps in the ecosystem
 * (including the engine behind apps like MyMasjidal's Athan+ for mosques
 * that haven't manually published iqamah times). It calculates Salah
 * times astronomically from a mosque's latitude/longitude on a given
 * date, using the calculation method the user picks.
 *
 *   Endpoint:
 *     https://api.aladhan.com/v1/timings/<dd-MM-yyyy>?latitude=…&longitude=…&method=…
 *
 *   Returns timings: Fajr, Sunrise, Dhuhr, Asr, Sunset, Maghrib, Isha,
 *                    Imsak, Midnight, Firstthird, Lastthird.
 *
 *   We also fetch the matching Hijri date from the same response.
 */

export const CALCULATION_METHODS = [
  { id: 1, name: 'University of Islamic Sciences, Karachi', region: 'South Asia' },
  { id: 2, name: 'Islamic Society of North America (ISNA)', region: 'North America' },
  { id: 3, name: 'Muslim World League', region: 'Europe / Far East' },
  { id: 4, name: 'Umm Al-Qura, Makkah', region: 'Saudi Arabia' },
  { id: 5, name: 'Egyptian General Authority', region: 'Egypt / Africa' },
  { id: 8, name: 'Gulf Region', region: 'GCC' },
  { id: 9, name: 'Kuwait', region: 'Kuwait' },
  { id: 10, name: 'Qatar', region: 'Qatar' },
  { id: 11, name: 'Singapore (MUIS)', region: 'Singapore' },
  { id: 12, name: 'Union des Organisations Islamiques de France', region: 'France' },
  { id: 13, name: 'Diyanet İşleri Başkanlığı', region: 'Turkey' },
  { id: 14, name: 'Spiritual Administration of Russia', region: 'Russia' },
  { id: 15, name: 'Moonsighting Committee Worldwide', region: 'Global' },
];

export const ASR_SCHOOLS = [
  { id: 0, name: 'Standard (Shafi, Maliki, Hanbali)' },
  { id: 1, name: 'Hanafi' },
];

export const DEFAULT_METHOD = 1;       // University of Karachi — sensible default for South Asia
export const DEFAULT_SCHOOL = 1;       // Hanafi — most common in South Asia
const DISPLAY_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function formatDateForApi(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/**
 * Convert a 24h time like "05:14" into "5:14 AM".
 */
export function to12Hour(time24) {
  if (!time24) return null;
  // AlAdhan sometimes returns "05:14 (BST)" — strip the timezone hint.
  const cleaned = String(time24).split(' ')[0];
  const [hStr, mStr] = cleaned.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return cleaned;
  const meridiem = h < 12 ? 'AM' : 'PM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${pad2(m)} ${meridiem}`;
}

/**
 * Fetch prayer times for a given location and (optional) date.
 *
 *   coords   – { latitude, longitude }
 *   options  – { date?: Date, method?: number, school?: number }
 *
 * Returns:
 *   {
 *     times: { Fajr: "5:14 AM", Sunrise: "...", Dhuhr, Asr, Maghrib, Isha },
 *     hijri: { day, month, year, monthName, weekdayName },
 *     gregorian: { day, monthName, year, weekdayName },
 *     methodId, methodName, schoolId, schoolName, source: 'aladhan'
 *   }
 */
export async function fetchPrayerTimes(
  coords,
  { date = new Date(), method = DEFAULT_METHOD, school = DEFAULT_SCHOOL } = {}
) {
  if (!coords || coords.latitude == null || coords.longitude == null) {
    throw new Error('Coordinates are required to fetch prayer times.');
  }

  const url =
    `https://api.aladhan.com/v1/timings/${formatDateForApi(date)}` +
    `?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}` +
    `&method=${method}` +
    `&school=${school}` +
    `&iso8601=false`;

  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new Error(`Could not reach AlAdhan (${e.message}).`);
  }
  if (!res.ok) {
    throw new Error(`AlAdhan returned ${res.status}.`);
  }
  const json = await res.json();
  if (json.code !== 200 || !json.data?.timings) {
    throw new Error(`AlAdhan: ${json.status || 'unexpected response'}`);
  }

  const t = json.data.timings;
  const times = DISPLAY_ORDER.reduce((acc, key) => {
    if (t[key]) acc[key] = to12Hour(t[key]);
    return acc;
  }, {});

  const methodEntry = CALCULATION_METHODS.find((m) => m.id === method);
  const schoolEntry = ASR_SCHOOLS.find((s) => s.id === school);

  return {
    times,
    hijri: {
      day: json.data.date?.hijri?.day,
      month: json.data.date?.hijri?.month?.number,
      monthName: json.data.date?.hijri?.month?.en,
      year: json.data.date?.hijri?.year,
      weekdayName: json.data.date?.hijri?.weekday?.en,
    },
    gregorian: {
      day: json.data.date?.gregorian?.day,
      monthName: json.data.date?.gregorian?.month?.en,
      year: json.data.date?.gregorian?.year,
      weekdayName: json.data.date?.gregorian?.weekday?.en,
    },
    timezone: json.data.meta?.timezone,
    methodId: method,
    methodName: methodEntry?.name || `Method ${method}`,
    schoolId: school,
    schoolName: schoolEntry?.name || `School ${school}`,
    source: 'aladhan',
  };
}

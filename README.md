# Nearest Mosque & Salah Time

A slick **React Native (Expo)** mobile app that:

1. Shows the **nearest mosque** from your current GPS location.
2. Pulls **Salah (prayer) times** by reading them straight from the selected mosque's website.
3. Has a prominent **Refresh** button + pull-to-refresh to re-search nearby mosques.
4. When you tap a mosque, opens a detail screen with **scraped prayer times**, directions, phone, and a link to the website.

Built with a **Modern Islamic minimal** look — deep emerald, warm gold accents, soft ivory background, geometric pattern in the header, and large readable Salah cards.

---

## Project layout

```
nearest-mosque-salah/
├─ App.js                       # Navigation root
├─ app.json                     # Expo config (permissions, API key slot)
├─ package.json
├─ babel.config.js
└─ src/
   ├─ theme.js                  # Colors / typography / radii / shadows
   ├─ components/
   │  ├─ HeaderHero.js          # Greeting + Hijri & Gregorian date chips
   │  ├─ IslamicPattern.js      # Tileable SVG geometric pattern
   │  ├─ MosqueCard.js          # Card row used in lists & nearest highlight
   │  ├─ RefreshButton.js       # Animated gold refresh pill
   │  └─ SalahTimeCard.js       # Prayer time list with "next prayer" highlight
   ├─ screens/
   │  ├─ HomeScreen.js          # Nearest mosque + nearby list + refresh
   │  └─ MosqueDetailScreen.js  # Selected mosque + scraped Salah times
   └─ services/
      ├─ location.js            # expo-location wrapper + haversine
      ├─ places.js              # Google Places Nearby Search + Details
      └─ salahScraper.js        # Heuristic prayer-time extractor
```

---

## Setup

### 1. Install dependencies

```bash
npm install
# or
yarn
```

### 2. (Optional) Choose a mosque-search provider

The app finds nearby mosques automatically — **no API key needed by default**.
It picks a provider based on what's configured:

| If…                                                  | Provider used     | What you get                                                                     |
|------------------------------------------------------|-------------------|----------------------------------------------------------------------------------|
| You do nothing                                       | **OpenStreetMap** (default, free) | Names, addresses, location, websites + phone numbers when mappers added them.   |
| You set `expo.extra.googlePlacesApiKey` in `app.json`| **Google Places** | Adds star ratings, "Open now" status, more accurate addresses, weekly hours.    |

**Going with the default (OpenStreetMap):** just skip ahead — there is nothing to set up.

**Switching to Google Places (optional):**

1. Go to https://console.cloud.google.com/ and create (or pick) a project.
2. Enable **Places API**.
3. Create an API key under **Credentials**, restrict it by app + by API.
4. Replace `REPLACE_WITH_GOOGLE_PLACES_KEY` in `app.json`:
   ```json
   "extra": { "googlePlacesApiKey": "YOUR_KEY_HERE" }
   ```
   Or set `EXPO_PUBLIC_GOOGLE_PLACES_KEY=...` in a `.env` file.

The header subtitle on Home shows which provider is currently active.

### 3. Run on a phone

```bash
npx expo start
```

- Scan the QR code with **Expo Go** (iOS / Android).
- The app will request **Location While Using** permission on first launch.

### 4. Preview in your desktop browser

```bash
npx expo start --web
```

This boots the app at `http://localhost:8081` (or `:19006` on older Expo CLIs) using `react-native-web`. Hot reload works the same as on the phone.

A few honest caveats for the web build:

- **Geolocation** uses the browser's `navigator.geolocation` API. It works on `localhost` and HTTPS but not on insecure remote hosts. Accuracy is lower than phone GPS — typically Wi-Fi-based.
- **Mosque list** works perfectly: the OpenStreetMap Overpass API and Google Places both send permissive CORS headers, so the browser can call them directly.
- **Scraping individual mosque websites from the browser is constrained by CORS.** Most mosque sites don't send `Access-Control-Allow-Origin`, so a direct `fetch()` is blocked. To make the web preview useful, the scraper automatically routes through a public CORS proxy (`https://corsproxy.io/?...`) when `Platform.OS === 'web'`.
  - This proxy is **for previewing only** — don't ship it to production. For a real web deploy, run your own tiny proxy and set `EXPO_PUBLIC_CORS_PROXY=https://your-proxy.example/?url=` before `expo start --web`.
  - On native iOS / Android there is **no CORS** and the scraper fetches each mosque site directly — no proxy involved.
- **Haptics** are no-ops on web (the calls are wrapped in `.catch(() => {})`).

### 5. Deploy the web build to Vercel

A `vercel.json` is included. To deploy:

1. Push the project to GitHub (or any git host Vercel can read).
2. In Vercel, click **Add New → Project**, import the repo.
3. Leave the framework preset on **Other** — `vercel.json` already overrides it. The settings will resolve to:
   - **Build Command:** `npx expo export --platform web`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. (Optional) Under **Environment Variables**, add:
   - `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — if you want Google Places instead of OpenStreetMap on the deployed site.
   - `EXPO_PUBLIC_CORS_PROXY` — your own CORS relay URL (e.g. `https://your-proxy.example/?url=`). Without one, the deployed site falls back to the public `corsproxy.io` for scraping mosque websites.
5. Deploy. The first build takes ~1–2 min; subsequent ones are faster thanks to Vercel's cache.

The included `vercel.json` also adds SPA rewrites (so React Navigation routes don't 404 on refresh) and a `Permissions-Policy: geolocation=(self)` header so the browser will prompt for location.

> **If you already deployed and got a 404:** Vercel deployed your raw source without building. Push the new `vercel.json`, then in the Vercel dashboard either trigger a redeploy, or change the project's *Build & Output Settings* to match the values above and redeploy.

### 6. Build a standalone mobile app

```bash
npx eas build -p android   # APK / AAB via EAS Build
npx eas build -p ios       # IPA via EAS Build (Apple Developer required)
```

---

## How it works

### Finding nearby mosques
`src/services/places.js` is a router that picks between two providers:

- **OpenStreetMap (default):** `src/services/osm.js` posts an [Overpass API](https://overpass-api.de/) query for nodes/ways/relations tagged `amenity=place_of_worship` + `religion=muslim` (plus `building=mosque`) within the radius, deduplicates them, and ranks by haversine distance.
- **Google Places (optional):** calls `https://maps.googleapis.com/maps/api/place/nearbysearch/json` with `type=mosque` and ranks the same way. Used when an API key is configured.

Both providers return identical mosque shapes so the screens don't care which one is active.

### Reading Salah times from a mosque website
`src/services/salahScraper.js` does a best-effort extraction:

1. Fetches the mosque website HTML.
2. Strips `<script>` / `<style>` / tags, decodes entities.
3. For each prayer name (Fajr, Sunrise, Dhuhr/Zuhr, Asr, Maghrib, Isha, Jummah) finds the matching line and pulls the first 1–2 time tokens (`5:14 AM`, `17:30`, `1:30 pm` …).
4. If two times appear on the same row, the second is treated as **Iqamah/Jamaat**.
5. Returns `{ times, iqamah, source, confidence }` where confidence is `high` / `medium` / `low` based on how many prayers were resolved.

This works for the majority of mosque sites that use plain HTML tables or labelled rows. Some sites (e.g. heavy SPAs, image-only timetables, or PDFs) cannot be scraped — in those cases the UI shows a clear empty state with a one-tap link to the website.

### Refresh behaviour
- The **gold "Refresh" pill** at the top re-runs the full pipeline: GPS → Places → ranking.
- Pull-to-refresh on the list does the same.
- On the mosque detail screen, **Refresh** re-fetches the website and re-parses Salah times.

---

## Permissions

| Platform | Permission | Reason |
|----------|------------|--------|
| iOS      | `NSLocationWhenInUseUsageDescription` | Find your nearest mosque |
| Android  | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Find your nearest mosque |
| Both     | Internet (implicit) | Google Places + mosque website fetch |

---

## Notes & caveats

- Times are **extracted automatically** from each mosque's website. If a mosque updates its schedule but its website doesn't, the app will reflect the website's value. The detail screen always offers a one-tap link to the source site.
- The app does **not** calculate prayer times astronomically — by design, per your spec, it only shows what the mosque's own site publishes.
- Google Places quotas: each refresh is one Nearby Search + one Place Details call per opened mosque. Restrict your key in production.

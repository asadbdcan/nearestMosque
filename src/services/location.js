import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Get the user's current GPS coordinates.
 *
 * On native (iOS/Android) this goes through expo-location which talks to
 * the platform's CLLocation / FusedLocationProvider stack.
 *
 * On web we skip expo-location's permission shim and call
 * `navigator.geolocation` directly. The browser owns the permission
 * dialog, and going through expo-location can prematurely report
 * "denied" before the user has been prompted at all.
 */
export async function getCurrentCoords({ highAccuracy = true } = {}) {
  if (Platform.OS === 'web') {
    return getCurrentCoordsWeb({ highAccuracy });
  }
  return getCurrentCoordsNative({ highAccuracy });
}

async function getCurrentCoordsNative({ highAccuracy }) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error(
      'Location permission is required to find nearby mosques. ' +
        'Please grant it in your device Settings and try again.'
    );
  }

  const services = await Location.hasServicesEnabledAsync();
  if (!services) {
    throw new Error('Location services are turned off. Please enable GPS and try again.');
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: highAccuracy ? Location.Accuracy.Balanced : Location.Accuracy.Lowest,
  });

  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  };
}

function getCurrentCoordsWeb({ highAccuracy }) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(
        new Error(
          'Your browser does not expose geolocation. Try a recent Chrome, Firefox, Safari, or Edge.'
        )
      );
      return;
    }

    // HTTPS / localhost is required for navigator.geolocation in modern
    // browsers. Surface a friendly hint when we're on insecure http.
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      reject(
        new Error(
          'Browsers only allow location on HTTPS or localhost. ' +
            'Open the site over https:// (Vercel deploys are already HTTPS).'
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => reject(new Error(humaniseGeoError(err))),
      {
        enableHighAccuracy: !!highAccuracy,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  });
}

function humaniseGeoError(err) {
  // GeolocationPositionError codes:
  //   1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  switch (err && err.code) {
    case 1:
      return (
        'Location is blocked for this site in your browser. ' +
        'Click the lock / location icon in the address bar, set Location to "Allow", then reload the page.'
      );
    case 2:
      return (
        'Your browser could not determine your location. ' +
        'On a desktop without GPS, make sure you have an internet connection so the browser can use Wi-Fi-based positioning. ' +
        'Some VPNs also block this.'
      );
    case 3:
      return 'Locating you timed out. Please try again.';
    default:
      return (err && err.message) || 'Could not get your location.';
  }
}

/**
 * Haversine distance in metres between two coords.
 */
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

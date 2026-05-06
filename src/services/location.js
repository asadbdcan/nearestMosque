import * as Location from 'expo-location';

/**
 * Request location permission and return current GPS coordinates.
 * Throws an Error with a user-friendly message on failure.
 */
export async function getCurrentCoords({ highAccuracy = true } = {}) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to find nearby mosques.');
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

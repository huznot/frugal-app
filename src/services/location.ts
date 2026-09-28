import * as Location from 'expo-location';
import { UserLocation } from './types';

function labelFrom(addr: Location.LocationGeocodedAddress | undefined, fallback: string) {
  if (!addr) return fallback;
  const city = addr.city || addr.subregion || addr.district;
  return [city, addr.region].filter(Boolean).join(', ') || fallback;
}

/** Country from the device's region setting (e.g. "en-CA" → "CA"), used when geocoding can't tell us. */
export function deviceCountry(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
    return region;
  } catch {
    return undefined;
  }
}

export async function hasLocationPermission() {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

/** Asks for permission (only when the user taps a "use my location" action) and reads GPS. */
export async function getGpsLocation(): Promise<UserLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('permission-denied');
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const { latitude: lat, longitude: lon } = pos.coords;
  let addr: Location.LocationGeocodedAddress | undefined;
  try {
    [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
  } catch {
    // Reverse geocoding is best-effort; coordinates are enough to work.
  }
  return { lat, lon, label: labelFrom(addr, 'Current location'), countryCode: addr?.isoCountryCode ?? deviceCountry(), source: 'gps' };
}

/** Postal code / city typed by the user, for people who'd rather not share GPS. */
export async function geocodePlace(text: string): Promise<UserLocation> {
  const results = await Location.geocodeAsync(text);
  if (!results.length) throw new Error('not-found');
  const { latitude: lat, longitude: lon } = results[0];
  let addr: Location.LocationGeocodedAddress | undefined;
  try {
    [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
  } catch {}
  return { lat, lon, label: labelFrom(addr, text.trim()), countryCode: addr?.isoCountryCode ?? deviceCountry(), source: 'manual' };
}

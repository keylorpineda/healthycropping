import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { type BoundaryPoint, parseBoundaryGeoJson, type Plot } from '@/db';
import { type SupportedCrop } from '@/version';

/**
 * Optional scan geotagging (#77).
 *
 * Off by default: the farmer turns it on in Settings, which asks for foreground location
 * permission. Only the point is stored with the scan; photos are uploaded without EXIF (#114).
 */
export const SCAN_LOCATION_KEY = 'healthycropping.scanLocationEnabled';

/** A fix older than this may come from another farm. */
export const MAX_FIX_AGE_MS = 5 * 60 * 1000;
/** Worse accuracy cannot tell neighbouring plots apart. */
export const MAX_ACCURACY_M = 100;
const FRESH_FIX_TIMEOUT_MS = 10_000;

export async function isScanLocationEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SCAN_LOCATION_KEY)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Turns geotagging on or off. Turning it on asks for permission and stays off when it is
 * refused; returns the resulting state.
 */
export async function setScanLocationEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'false');
      return false;
    }
  }
  await AsyncStorage.setItem(SCAN_LOCATION_KEY, enabled ? 'true' : 'false');
  return enabled;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

function usable(fix: Location.LocationObject | null): BoundaryPoint | null {
  if (!fix) return null;
  const accuracy = fix.coords.accuracy;
  if (accuracy !== null && accuracy > MAX_ACCURACY_M) return null;
  return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
}

/**
 * Where the current scan is taken, or `null` when geotagging is off, permission was revoked,
 * or no fix is accurate enough. Never throws: a scan must not fail because of GPS.
 */
export async function captureScanLocation(): Promise<BoundaryPoint | null> {
  try {
    if (!(await isScanLocationEnabled())) return null;
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const recent = usable(
      await Location.getLastKnownPositionAsync({
        maxAge: MAX_FIX_AGE_MS,
        requiredAccuracy: MAX_ACCURACY_M,
      }),
    );
    if (recent) return recent;
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      FRESH_FIX_TIMEOUT_MS,
    );
    return usable(fresh);
  } catch {
    return null;
  }
}

/** Ray casting on longitude/latitude; fine at plot scale away from the poles and antimeridian. */
export function pointInBoundary(point: BoundaryPoint, ring: readonly BoundaryPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const crosses =
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) +
          a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * The plot of the scanned crop whose boundary contains the point, if exactly one does;
 * overlapping boundaries are ambiguous, so the farmer picks the plot by hand instead.
 */
export function plotContaining(
  point: BoundaryPoint,
  crop: SupportedCrop,
  plots: readonly Plot[],
): Plot | null {
  const matches = plots.filter((plot) => {
    if (plot.crop !== crop || plot.deleted_at !== null) return false;
    const ring = parseBoundaryGeoJson(plot.boundary_geojson);
    return ring !== null && pointInBoundary(point, ring);
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

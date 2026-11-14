/** Why a typed plot location was rejected; each maps to a `farms.*` i18n key. */
export type PlotLocationError = 'locationPair' | 'latitudeRange' | 'longitudeRange';

export type PlotLocationResult =
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; error: PlotLocationError };

function parseCoordinate(text: string, limit: number): number | null {
  // Spanish keyboards often type a decimal comma.
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

/**
 * Parses the optional plot point typed in the form (#136). Both coordinates or neither,
 * in WGS84 decimal degrees, mirroring the API's `PlotCreate` validation.
 */
export function parsePlotLocation(latitudeText: string, longitudeText: string): PlotLocationResult {
  const hasLatitude = latitudeText.trim() !== '';
  const hasLongitude = longitudeText.trim() !== '';
  if (!hasLatitude && !hasLongitude) {
    return { ok: true, latitude: null, longitude: null };
  }
  if (hasLatitude !== hasLongitude) {
    return { ok: false, error: 'locationPair' };
  }
  const latitude = parseCoordinate(latitudeText, 90);
  if (latitude === null) {
    return { ok: false, error: 'latitudeRange' };
  }
  const longitude = parseCoordinate(longitudeText, 180);
  if (longitude === null) {
    return { ok: false, error: 'longitudeRange' };
  }
  return { ok: true, latitude, longitude };
}

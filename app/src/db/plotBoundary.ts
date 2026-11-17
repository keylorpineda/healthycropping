/**
 * Plot boundary polygons (#41).
 *
 * SQLite keeps a GeoJSON `Polygon` (closed ring of `[longitude, latitude]`), while the API
 * takes an open list of `{latitude, longitude}` points because Firestore cannot store nested
 * arrays. These helpers convert between both and mirror the API's `Boundary` validation.
 */

export interface BoundaryPoint {
  latitude: number;
  longitude: number;
}

/** Mirrors `MAX_BOUNDARY_POINTS` in `api/src/healthycropping_api/schemas.py`. */
export const MAX_BOUNDARY_POINTS = 100;

export type BoundaryError = 'tooFewPoints' | 'tooManyPoints' | 'outOfRange';

const EARTH_RADIUS_M = 6_371_008.8;
const SQUARE_METERS_PER_HECTARE = 10_000;

function samePoint(a: BoundaryPoint, b: BoundaryPoint): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/** Drops consecutive repeats and a closing vertex equal to the first one. */
export function normalizeBoundary(points: readonly BoundaryPoint[]): BoundaryPoint[] {
  const result: BoundaryPoint[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || !samePoint(previous, point)) {
      result.push({ latitude: point.latitude, longitude: point.longitude });
    }
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (result.length > 1 && first && last && samePoint(first, last)) {
    result.pop();
  }
  return result;
}

/** Returns why a drawn boundary cannot be saved, or `null` when it is valid. */
export function validateBoundary(points: readonly BoundaryPoint[]): BoundaryError | null {
  const normalized = normalizeBoundary(points);
  const distinct = new Set(normalized.map((point) => `${point.latitude},${point.longitude}`));
  if (distinct.size < 3) {
    return 'tooFewPoints';
  }
  if (normalized.length > MAX_BOUNDARY_POINTS) {
    return 'tooManyPoints';
  }
  const outOfRange = normalized.some(
    (point) =>
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 ||
      Math.abs(point.longitude) > 180,
  );
  return outOfRange ? 'outOfRange' : null;
}

/** Serializes an open ring as a GeoJSON Polygon string for the `boundary_geojson` column. */
export function boundaryToGeoJson(points: readonly BoundaryPoint[]): string {
  const ring: GeoJSON.Position[] = normalizeBoundary(points).map((point) => [
    point.longitude,
    point.latitude,
  ]);
  const closed = ring.length > 0 ? [...ring, ring[0] as GeoJSON.Position] : ring;
  const polygon: GeoJSON.Polygon = { type: 'Polygon', coordinates: [closed] };
  return JSON.stringify(polygon);
}

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

/** Reads the `boundary_geojson` column back into an open ring; unreadable values become `null`. */
export function parseBoundaryGeoJson(text: string | null | undefined): BoundaryPoint[] | null {
  if (!text) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const polygon = parsed as { type?: unknown; coordinates?: unknown };
    if (polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) return null;
    const ring: unknown = polygon.coordinates[0];
    if (!Array.isArray(ring) || !ring.every(isPosition)) return null;
    const points = normalizeBoundary(
      ring.map(([longitude, latitude]) => ({ latitude, longitude })),
    );
    return validateBoundary(points) === null ? points : null;
  } catch {
    return null;
  }
}

/** Vertex average; good enough to place a weather point inside a small, convex-ish plot. */
export function boundaryCenter(points: readonly BoundaryPoint[]): BoundaryPoint {
  const ring = normalizeBoundary(points);
  const sum = ring.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / ring.length, longitude: sum.longitude / ring.length };
}

/**
 * Approximate polygon area in hectares on a sphere (shoelace on an equirectangular
 * projection around the ring's mean latitude). Error is well under 1% for farm-sized plots.
 */
export function boundaryAreaHa(points: readonly BoundaryPoint[]): number {
  const ring = normalizeBoundary(points);
  if (ring.length < 3) return 0;
  const meanLatitude =
    (ring.reduce((acc, p) => acc + p.latitude, 0) / ring.length) * (Math.PI / 180);
  const toXY = (point: BoundaryPoint): [number, number] => [
    EARTH_RADIUS_M * point.longitude * (Math.PI / 180) * Math.cos(meanLatitude),
    EARTH_RADIUS_M * point.latitude * (Math.PI / 180),
  ];
  let twiceArea = 0;
  ring.forEach((point, i) => {
    const next = ring[(i + 1) % ring.length] ?? point;
    const [x1, y1] = toXY(point);
    const [x2, y2] = toXY(next);
    twiceArea += x1 * y2 - x2 * y1;
  });
  return Math.abs(twiceArea) / 2 / SQUARE_METERS_PER_HECTARE;
}

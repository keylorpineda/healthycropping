import { type DiagnosisSeverity, type Scan } from '@/db';
import { type SupportedCrop } from '@/version';

/**
 * Disease hotspots on the plot map (#77): geotagged scans as GeoJSON points, filtered by
 * crop, disease class and date range. MapLibre clusters them natively.
 */
export type HotspotRange = '30d' | '90d' | '365d' | 'all';

export const HOTSPOT_RANGES: readonly HotspotRange[] = ['30d', '90d', '365d', 'all'];

const RANGE_DAYS: Record<HotspotRange, number | null> = {
  '30d': 30,
  '90d': 90,
  '365d': 365,
  all: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HotspotFilters {
  crop: SupportedCrop | null;
  predictedClass: string | null;
  range: HotspotRange;
}

export const DEFAULT_HOTSPOT_FILTERS: HotspotFilters = {
  crop: null,
  predictedClass: null,
  range: '90d',
};

/** Numeric rank used by cluster expressions: the worst status in a cluster wins. */
export const SEVERITY_RANK: Record<DiagnosisSeverity, number> = {
  healthy: 0,
  watch: 1,
  actNow: 2,
};

export type LocatedScan = Scan & { latitude: number; longitude: number };

/**
 * Scans that can be drawn: geotagged, not deleted, and confident. Low-confidence results are
 * left out because the app itself tells the farmer not to rely on them.
 */
export function mappableScans(scans: readonly Scan[]): LocatedScan[] {
  return scans.filter(
    (scan): scan is LocatedScan =>
      scan.deleted_at === null &&
      scan.is_low_confidence === 0 &&
      typeof scan.latitude === 'number' &&
      typeof scan.longitude === 'number',
  );
}

export function filterHotspots(
  scans: readonly LocatedScan[],
  filters: HotspotFilters,
  now: Date = new Date(),
): LocatedScan[] {
  const days = RANGE_DAYS[filters.range];
  const since = days === null ? null : now.getTime() - days * DAY_MS;
  return scans.filter(
    (scan) =>
      (filters.crop === null || scan.crop === filters.crop) &&
      (filters.predictedClass === null || scan.predicted_class === filters.predictedClass) &&
      (since === null || Date.parse(scan.scanned_at) >= since),
  );
}

export function hotspotFeatures(scans: readonly LocatedScan[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: scans.map((scan) => ({
      type: 'Feature',
      id: scan.id,
      properties: {
        scanId: scan.id,
        severity: scan.severity,
        rank: SEVERITY_RANK[scan.severity],
        predictedClass: scan.predicted_class,
      },
      geometry: { type: 'Point', coordinates: [scan.longitude, scan.latitude] },
    })),
  };
}

/** Distinct values present in the scans, in first-seen order, for the filter chips. */
export function distinctValues<K extends 'crop' | 'predicted_class'>(
  scans: readonly LocatedScan[],
  key: K,
): LocatedScan[K][] {
  return [...new Set(scans.map((scan) => scan[key]))];
}

export interface SeverityCounts {
  healthy: number;
  watch: number;
  actNow: number;
}

export function countBySeverity(scans: readonly LocatedScan[]): SeverityCounts {
  const counts: SeverityCounts = { healthy: 0, watch: 0, actNow: 0 };
  for (const scan of scans) counts[scan.severity] += 1;
  return counts;
}

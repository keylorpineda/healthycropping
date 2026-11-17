import { type NdviMonth } from '@/services/ndvi';

/**
 * Canopy vigor from monthly NDVI (#82).
 *
 * The bands are general vegetation ranges, not crop-calibrated thresholds: under 0.3 is sparse
 * or stressed canopy, 0.3-0.6 moderate, above 0.6 dense. The anomaly compares the latest clear
 * month with the farm's own average of the other clear months, which matters more than the
 * absolute value for shaded coffee or cacao.
 */
export type VigorLevel = 'low' | 'moderate' | 'high';
export type VigorTrend = 'below' | 'normal' | 'above';

export const LOW_VIGOR_MAX = 0.3;
export const HIGH_VIGOR_MIN = 0.6;
/** NDVI difference from the plot's own average that counts as unusual. */
export const ANOMALY_DELTA = 0.1;
/** Fewer clear months than this give no trustworthy average. */
export const MIN_BASELINE_MONTHS = 3;

export function vigorLevel(ndvi: number): VigorLevel {
  if (ndvi < LOW_VIGOR_MAX) return 'low';
  if (ndvi > HIGH_VIGOR_MIN) return 'high';
  return 'moderate';
}

export interface VigorSummary {
  latest: NdviMonth & { ndvi: number };
  level: VigorLevel;
  /** `null` when there are not enough clear months to compare against. */
  trend: VigorTrend | null;
  baseline: number | null;
}

function isClear(month: NdviMonth): month is NdviMonth & { ndvi: number } {
  return month.status === 'ok' && month.ndvi !== null;
}

/** Latest clear month, its vigor band and how it compares with the plot's other months. */
export function summarizeVigor(months: readonly NdviMonth[]): VigorSummary | null {
  const clear = months.filter(isClear);
  const latest = clear[clear.length - 1];
  if (!latest) return null;
  const others = clear.slice(0, -1);
  if (others.length < MIN_BASELINE_MONTHS) {
    return { latest, level: vigorLevel(latest.ndvi), trend: null, baseline: null };
  }
  const baseline = others.reduce((sum, month) => sum + month.ndvi, 0) / others.length;
  const delta = latest.ndvi - baseline;
  const trend: VigorTrend =
    delta <= -ANOMALY_DELTA ? 'below' : delta >= ANOMALY_DELTA ? 'above' : 'normal';
  return { latest, level: vigorLevel(latest.ndvi), trend, baseline };
}

/** Bar height as a share of the chart: NDVI 0 sits at the bottom, 1 at the top. */
export function barFraction(ndvi: number): number {
  return Math.max(0.04, Math.min(1, ndvi));
}

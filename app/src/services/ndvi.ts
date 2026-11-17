import { QueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { plotNdviRepository, type Plot, type PlotNdviRepository } from '@/db';
import { useAuthStore } from '@/stores/auth';

import { apiClient, ApiError, type ApiClient } from './api';

/**
 * Monthly Sentinel-2 NDVI series per plot (`GET /plots/{id}/ndvi`, #43 / #81).
 *
 * The latest answer per plot is kept in SQLite and shown offline, together with when it
 * was fetched. An answer younger than `FRESH_FOR_MS` for the same plot geometry is reused
 * without a request, so opening screens does not spend the daily Earth Engine quota.
 */

export type NdviStatus = 'ok' | 'cloudy' | 'no_data';

export interface NdviMonth {
  month: string;
  ndvi: number | null;
  clear_fraction: number;
  images: number;
  status: NdviStatus;
  cached: boolean;
}

export interface PlotNdvi {
  plot_id: string;
  source: 'boundary' | 'point';
  collection: string;
  months: NdviMonth[];
  attribution: string;
}

export interface PlotNdviResult {
  ndvi: PlotNdvi;
  /** `cache`: the SQLite copy, shown because it is fresh or the API could not be reached. */
  source: 'network' | 'cache';
  fetchedAt: string;
}

export type NdviFailure =
  | 'noLocation'
  | 'notConfigured'
  | 'serverNotConfigured'
  | 'signedOut'
  | 'notSynced'
  | 'offline'
  | 'rateLimited'
  | 'quotaExceeded'
  | 'unavailable';

export class NdviError extends Error {
  readonly reason: NdviFailure;

  constructor(reason: NdviFailure) {
    super(reason);
    this.name = 'NdviError';
    this.reason = reason;
  }
}

/** Reuse a stored answer for this long; months only change at month boundaries and the API caches settled months. */
export const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

const STATUSES: readonly NdviStatus[] = ['ok', 'cloudy', 'no_data'];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStatus(value: unknown): value is NdviStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function parseNdviMonth(value: unknown): NdviMonth | null {
  if (
    !isRecord(value) ||
    typeof value.month !== 'string' ||
    !MONTH_PATTERN.test(value.month) ||
    typeof value.clear_fraction !== 'number' ||
    !Number.isFinite(value.clear_fraction) ||
    value.clear_fraction < 0 ||
    value.clear_fraction > 1 ||
    typeof value.images !== 'number' ||
    !Number.isInteger(value.images) ||
    value.images < 0 ||
    !isStatus(value.status)
  ) {
    return null;
  }
  let ndvi: number | null;
  if (value.ndvi === null) {
    ndvi = null;
  } else if (
    typeof value.ndvi === 'number' &&
    Number.isFinite(value.ndvi) &&
    value.ndvi >= -1 &&
    value.ndvi <= 1
  ) {
    ndvi = value.ndvi;
  } else {
    return null;
  }
  if (value.cached !== undefined && typeof value.cached !== 'boolean') {
    return null;
  }
  return {
    month: value.month,
    ndvi,
    clear_fraction: value.clear_fraction,
    images: value.images,
    status: value.status,
    cached: value.cached ?? false,
  };
}

/** Validates an API or SQLite payload; returns null for anything malformed. */
export function parsePlotNdvi(value: unknown): PlotNdvi | null {
  if (
    !isRecord(value) ||
    typeof value.plot_id !== 'string' ||
    (value.source !== 'boundary' && value.source !== 'point') ||
    typeof value.collection !== 'string' ||
    !Array.isArray(value.months)
  ) {
    return null;
  }
  if (typeof value.attribution !== 'string' || value.attribution.trim().length === 0) {
    // Copernicus attribution is required alongside the data, so a payload without it is unusable.
    return null;
  }
  const months = value.months.map(parseNdviMonth);
  if (months.some((month) => month === null)) {
    return null;
  }
  return {
    plot_id: value.plot_id,
    source: value.source,
    collection: value.collection,
    months: months as NdviMonth[],
    attribution: value.attribution,
  };
}

export type GeometryPlot = Pick<Plot, 'id' | 'boundary_geojson' | 'latitude' | 'longitude'>;

/** Key identifying the geometry an NDVI answer was computed over, or null when unlocated. */
export function plotGeometryKey(
  plot: Pick<Plot, 'boundary_geojson' | 'latitude' | 'longitude'>,
): string | null {
  if (typeof plot.boundary_geojson === 'string' && plot.boundary_geojson.length > 0) {
    return `boundary:${plot.boundary_geojson}`;
  }
  if (typeof plot.latitude === 'number' && typeof plot.longitude === 'number') {
    return `point:${plot.latitude},${plot.longitude}`;
  }
  return null;
}

function toFailure(error: unknown): NdviFailure {
  if (error instanceof ApiError) {
    if (error.code === 'not-configured') return 'notConfigured';
    if (error.status === 0) return 'offline';
    if (error.status === 401) return 'signedOut';
    // The plot is only known to the API after the sync engine has pushed it.
    if (error.status === 404) return 'notSynced';
    if (error.status === 422) return 'noLocation';
    if (error.status === 429) return 'rateLimited';
    if (error.status === 503 && error.code === 'ndvi_quota_exceeded') return 'quotaExceeded';
    if (error.status === 503 && error.code === 'ndvi_not_configured') return 'serverNotConfigured';
  }
  return 'unavailable';
}

export interface LoadPlotNdviDeps {
  client?: ApiClient;
  repository?: PlotNdviRepository;
  isSignedIn?: () => boolean;
  now?: () => Date;
  /** Skip a fresh stored copy (pull to refresh / retry). */
  force?: boolean;
}

function readStored(
  repository: PlotNdviRepository,
  plotId: string,
  geometryKey: string,
): PlotNdviResult | null {
  const stored = repository.get(plotId);
  if (!stored || stored.geometry_key !== geometryKey) {
    return null;
  }
  try {
    const ndvi = parsePlotNdvi(JSON.parse(stored.response_json));
    return ndvi ? { ndvi, source: 'cache', fetchedAt: stored.fetched_at } : null;
  } catch {
    return null;
  }
}

/**
 * Fresh stored answer if there is one, otherwise ask the API and keep the answer. When the
 * API cannot be reached, the stored answer for the same geometry is returned whatever its age.
 */
export async function loadPlotNdvi(
  plot: GeometryPlot,
  {
    client = apiClient,
    repository = plotNdviRepository,
    isSignedIn = () => useAuthStore.getState().status === 'signedIn',
    now = () => new Date(),
    force = false,
  }: LoadPlotNdviDeps = {},
): Promise<PlotNdviResult> {
  const geometryKey = plotGeometryKey(plot);
  if (geometryKey === null) {
    throw new NdviError('noLocation');
  }
  const stored = readStored(repository, plot.id, geometryKey);
  if (stored && !force && now().getTime() - new Date(stored.fetchedAt).getTime() < FRESH_FOR_MS) {
    return stored;
  }

  let failure: NdviFailure | null = null;
  let payload: unknown;
  if (!client.isConfigured) {
    failure = 'notConfigured';
  } else if (!isSignedIn()) {
    failure = 'signedOut';
  } else {
    try {
      payload = await client.request<unknown>(`/plots/${encodeURIComponent(plot.id)}/ndvi`);
    } catch (error) {
      failure = toFailure(error);
    }
  }
  if (failure) {
    if (stored) {
      return stored;
    }
    throw new NdviError(failure);
  }

  const ndvi = parsePlotNdvi(payload);
  if (!ndvi) {
    if (stored) {
      return stored;
    }
    throw new NdviError('unavailable');
  }
  const fetchedAt = now().toISOString();
  try {
    repository.save(plot.id, geometryKey, JSON.stringify(ndvi), fetchedAt);
  } catch (error) {
    // The answer is still shown; it just will not be available offline.
    console.error('Failed to store plot NDVI', error);
  }
  return { ndvi, source: 'network', fetchedAt };
}

export const ndviQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: FRESH_FOR_MS },
  },
});

export interface UsePlotNdviOptions {
  queryClient?: QueryClient;
  load?: (plot: GeometryPlot, force: boolean) => Promise<PlotNdviResult>;
}

export interface PlotNdviQuery {
  query: UseQueryResult<PlotNdviResult, NdviError>;
  /** Asks the API again even if the stored answer is fresh. */
  refresh: () => void;
}

function toError(error: unknown): NdviError {
  return error instanceof NdviError ? error : new NdviError('unavailable');
}

export function usePlotNdvi(
  plot: GeometryPlot | null,
  {
    queryClient = ndviQueryClient,
    load = (p, force) => loadPlotNdvi(p, { force }),
  }: UsePlotNdviOptions = {},
): PlotNdviQuery {
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  const geometryKey = plot ? plotGeometryKey(plot) : null;
  const queryKey = ['plot-ndvi', plot?.id ?? null, geometryKey, signedIn];
  const query = useQuery<PlotNdviResult, NdviError>(
    {
      queryKey,
      queryFn: async () => {
        if (!plot) {
          throw new NdviError('noLocation');
        }
        try {
          return await load(plot, false);
        } catch (error) {
          throw toError(error);
        }
      },
      enabled: plot !== null,
    },
    queryClient,
  );
  const refresh = () => {
    if (!plot) {
      return;
    }
    void queryClient
      .fetchQuery({
        queryKey,
        queryFn: async () => {
          try {
            return await load(plot, true);
          } catch (error) {
            throw toError(error);
          }
        },
        staleTime: 0,
      })
      .catch(() => undefined);
  };
  return { query, refresh };
}

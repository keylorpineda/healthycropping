import { QueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  plotsRepository,
  weatherRisksRepository,
  type Plot,
  type WeatherRisksRepository,
} from '@/db';
import { useAuthStore } from '@/stores/auth';

import { apiClient, ApiError, type ApiClient } from './api';

/**
 * Rule-based weather disease risk per plot (`GET /plots/{id}/weather-risk`, #78).
 *
 * The latest answer per plot is kept in SQLite and shown offline, together with when it
 * was fetched. An answer younger than `FRESH_FOR_MS` is reused without a request, so
 * opening screens does not spend the API's hourly weather quota.
 */

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface WindowRisk {
  window: 'recent' | 'upcoming';
  days: number;
  favourable_days: number;
  favourable_dates: string[];
  level: RiskLevel;
}

export interface RiskSource {
  citation: string;
  url: string;
}

export interface RiskThreshold {
  name: string;
  basis: 'source' | 'provisional';
  source: RiskSource | null;
}

export interface DiseaseRisk {
  crop: string;
  disease_class: string;
  status: 'evaluated' | 'insufficient_evidence';
  level: RiskLevel | null;
  recent: WindowRisk | null;
  upcoming: WindowRisk | null;
  thresholds: RiskThreshold[];
}

export interface WeatherAttribution {
  text: string;
  url: string;
  license: string;
  license_url: string;
}

export interface WeatherRisk {
  plot_id: string;
  /** True when the API served its own last copy because Open-Meteo failed. */
  stale: boolean;
  risks: DiseaseRisk[];
  attribution: WeatherAttribution;
}

export interface WeatherRiskResult {
  risk: WeatherRisk;
  /** `cache`: the SQLite copy, shown because it is fresh or the API could not be reached. */
  source: 'network' | 'cache';
  fetchedAt: string;
}

export type WeatherRiskFailure =
  | 'noLocation'
  | 'notConfigured'
  | 'signedOut'
  | 'notSynced'
  | 'offline'
  | 'rateLimited'
  | 'unavailable';

export class WeatherRiskError extends Error {
  readonly reason: WeatherRiskFailure;

  constructor(reason: WeatherRiskFailure) {
    super(reason);
    this.name = 'WeatherRiskError';
    this.reason = reason;
  }
}

/** Reuse a stored answer for this long; Open-Meteo updates hourly and the API caches 1 h. */
export const FRESH_FOR_MS = 3 * 60 * 60 * 1000;

const LEVELS: readonly RiskLevel[] = ['low', 'moderate', 'high'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

function parseWindow(value: unknown): WindowRisk | null | undefined {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    (value.window !== 'recent' && value.window !== 'upcoming') ||
    typeof value.days !== 'number' ||
    typeof value.favourable_days !== 'number' ||
    !Array.isArray(value.favourable_dates) ||
    !isLevel(value.level)
  ) {
    return undefined;
  }
  return {
    window: value.window,
    days: value.days,
    favourable_days: value.favourable_days,
    favourable_dates: value.favourable_dates.filter((d): d is string => typeof d === 'string'),
    level: value.level,
  };
}

function parseThreshold(value: unknown): RiskThreshold | null {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null;
  }
  if (value.basis !== 'source' && value.basis !== 'provisional') {
    return null;
  }
  const source = value.source;
  const parsedSource =
    isRecord(source) && typeof source.citation === 'string' && typeof source.url === 'string'
      ? { citation: source.citation, url: source.url }
      : null;
  return { name: value.name, basis: value.basis, source: parsedSource };
}

function parseDiseaseRisk(value: unknown): DiseaseRisk | null {
  if (
    !isRecord(value) ||
    typeof value.crop !== 'string' ||
    typeof value.disease_class !== 'string' ||
    (value.status !== 'evaluated' && value.status !== 'insufficient_evidence') ||
    !Array.isArray(value.thresholds)
  ) {
    return null;
  }
  const level = value.level === null ? null : isLevel(value.level) ? value.level : undefined;
  const recent = parseWindow(value.recent);
  const upcoming = parseWindow(value.upcoming);
  if (level === undefined || recent === undefined || upcoming === undefined) {
    return null;
  }
  if (value.status === 'evaluated' && (level === null || !recent || !upcoming)) {
    return null;
  }
  const thresholds = value.thresholds.map(parseThreshold);
  if (thresholds.some((threshold) => threshold === null)) {
    return null;
  }
  return {
    crop: value.crop,
    disease_class: value.disease_class,
    status: value.status,
    level,
    recent,
    upcoming,
    thresholds: thresholds as RiskThreshold[],
  };
}

/** Validates an API or SQLite payload; returns null for anything malformed. */
export function parseWeatherRisk(value: unknown): WeatherRisk | null {
  if (!isRecord(value) || typeof value.plot_id !== 'string' || !Array.isArray(value.risks)) {
    return null;
  }
  const a = value.attribution;
  if (
    !isRecord(a) ||
    typeof a.text !== 'string' ||
    typeof a.url !== 'string' ||
    typeof a.license !== 'string' ||
    typeof a.license_url !== 'string'
  ) {
    // The CC BY 4.0 attribution must be shown with the data, so a payload without it is unusable.
    return null;
  }
  const risks = value.risks.map(parseDiseaseRisk);
  if (risks.some((risk) => risk === null)) {
    return null;
  }
  return {
    plot_id: value.plot_id,
    stale: value.stale === true,
    risks: risks as DiseaseRisk[],
    attribution: { text: a.text, url: a.url, license: a.license, license_url: a.license_url },
  };
}

/** Highest evaluated level, or null when nothing could be evaluated. */
export function highestLevel(risk: WeatherRisk): RiskLevel | null {
  let best: RiskLevel | null = null;
  for (const disease of risk.risks) {
    if (disease.level && (best === null || LEVELS.indexOf(disease.level) > LEVELS.indexOf(best))) {
      best = disease.level;
    }
  }
  return best;
}

function toFailure(error: unknown): WeatherRiskFailure {
  if (error instanceof ApiError) {
    if (error.code === 'not-configured') return 'notConfigured';
    if (error.status === 0) return 'offline';
    if (error.status === 401) return 'signedOut';
    // The plot is only known to the API after the sync engine has pushed it.
    if (error.status === 404) return 'notSynced';
    if (error.status === 429) return 'rateLimited';
  }
  return 'unavailable';
}

export interface LoadWeatherRiskDeps {
  client?: ApiClient;
  repository?: WeatherRisksRepository;
  isSignedIn?: () => boolean;
  now?: () => Date;
  /** Skip a fresh stored copy (pull to refresh / retry). */
  force?: boolean;
}

type LocatedPlot = Pick<Plot, 'id' | 'latitude' | 'longitude'>;

function readStored(
  repository: WeatherRisksRepository,
  plot: LocatedPlot,
): WeatherRiskResult | null {
  const stored = repository.get(plot.id);
  if (!stored || stored.latitude !== plot.latitude || stored.longitude !== plot.longitude) {
    return null;
  }
  try {
    const risk = parseWeatherRisk(JSON.parse(stored.response_json));
    return risk ? { risk, source: 'cache', fetchedAt: stored.fetched_at } : null;
  } catch {
    return null;
  }
}

/**
 * Fresh stored answer if there is one, otherwise ask the API and keep the answer. When the
 * API cannot be reached, the stored answer for the same point is returned whatever its age.
 */
export async function loadWeatherRisk(
  plot: LocatedPlot,
  {
    client = apiClient,
    repository = weatherRisksRepository,
    isSignedIn = () => useAuthStore.getState().status === 'signedIn',
    now = () => new Date(),
    force = false,
  }: LoadWeatherRiskDeps = {},
): Promise<WeatherRiskResult> {
  const { latitude, longitude } = plot;
  if (latitude === null || longitude === null) {
    throw new WeatherRiskError('noLocation');
  }
  const stored = readStored(repository, plot);
  if (stored && !force && now().getTime() - new Date(stored.fetchedAt).getTime() < FRESH_FOR_MS) {
    return stored;
  }

  let failure: WeatherRiskFailure | null = null;
  let payload: unknown;
  if (!client.isConfigured) {
    failure = 'notConfigured';
  } else if (!isSignedIn()) {
    failure = 'signedOut';
  } else {
    try {
      const query = `latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`;
      payload = await client.request<unknown>(
        `/plots/${encodeURIComponent(plot.id)}/weather-risk?${query}`,
      );
    } catch (error) {
      failure = toFailure(error);
    }
  }
  if (failure) {
    if (stored) {
      return stored;
    }
    throw new WeatherRiskError(failure);
  }

  const risk = parseWeatherRisk(payload);
  if (!risk) {
    if (stored) {
      return stored;
    }
    throw new WeatherRiskError('unavailable');
  }
  const fetchedAt = now().toISOString();
  try {
    repository.save(plot.id, latitude, longitude, JSON.stringify(risk), fetchedAt);
  } catch (error) {
    // The answer is still shown; it just will not be available offline.
    console.error('Failed to store weather risk', error);
  }
  return { risk, source: 'network', fetchedAt };
}

export const weatherRiskQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: FRESH_FOR_MS },
  },
});

export interface UseWeatherRiskOptions {
  queryClient?: QueryClient;
  load?: (plot: LocatedPlot, force: boolean) => Promise<WeatherRiskResult>;
}

export interface WeatherRiskQuery {
  query: UseQueryResult<WeatherRiskResult, WeatherRiskError>;
  /** Asks the API again even if the stored answer is fresh. */
  refresh: () => void;
}

function toError(error: unknown): WeatherRiskError {
  return error instanceof WeatherRiskError ? error : new WeatherRiskError('unavailable');
}

export function useWeatherRisk(
  plot: LocatedPlot | null,
  {
    queryClient = weatherRiskQueryClient,
    load = (p, force) => loadWeatherRisk(p, { force }),
  }: UseWeatherRiskOptions = {},
): WeatherRiskQuery {
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  const queryKey = [
    'weather-risk',
    plot?.id ?? null,
    plot?.latitude ?? null,
    plot?.longitude ?? null,
    signedIn,
  ];
  const query = useQuery<WeatherRiskResult, WeatherRiskError>(
    {
      queryKey,
      queryFn: async () => {
        if (!plot) {
          throw new WeatherRiskError('noLocation');
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

export interface WeatherAlert {
  plot: Plot;
  disease: DiseaseRisk;
  level: 'moderate' | 'high';
  result: WeatherRiskResult;
}

/**
 * Moderate and high risks across the user's located plots, highest first. Each plot goes
 * through `loadWeatherRisk`, so fresh stored answers cost no request and offline shows the
 * last known answers; plots that fail (not synced yet, signed out with no copy) are skipped.
 */
export async function loadWeatherAlerts(
  plots: Plot[],
  load: (plot: LocatedPlot) => Promise<WeatherRiskResult> = (plot) => loadWeatherRisk(plot),
): Promise<WeatherAlert[]> {
  const alerts: WeatherAlert[] = [];
  for (const plot of plots) {
    if (plot.latitude === null || plot.longitude === null) {
      continue;
    }
    let result: WeatherRiskResult;
    try {
      result = await load(plot);
    } catch {
      continue;
    }
    for (const disease of result.risk.risks) {
      if (disease.level === 'moderate' || disease.level === 'high') {
        alerts.push({ plot, disease, level: disease.level, result });
      }
    }
  }
  return alerts.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level));
}

export interface UseWeatherAlertsOptions {
  queryClient?: QueryClient;
  loadPlots?: () => Plot[];
  load?: (plot: LocatedPlot) => Promise<WeatherRiskResult>;
}

export function useWeatherAlerts({
  queryClient = weatherRiskQueryClient,
  loadPlots,
  load,
}: UseWeatherAlertsOptions = {}): UseQueryResult<WeatherAlert[], Error> {
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  return useQuery<WeatherAlert[], Error>(
    {
      queryKey: ['weather-alerts', signedIn],
      queryFn: async () => {
        const plots = loadPlots ? loadPlots() : plotsRepository.getAll();
        return loadWeatherAlerts(plots, load);
      },
      // Mostly SQLite reads; re-read on every visit so a newly set plot point shows up.
      staleTime: 0,
    },
    queryClient,
  );
}

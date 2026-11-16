import * as SQLite from 'expo-sqlite';

import RISK_PAYLOAD from '../fixtures/weather_risk.json';
import { initDatabase, weatherRisksRepository, type Plot } from '@/db';
import { ApiError, type ApiClient } from '@/services/api';
import {
  FRESH_FOR_MS,
  WeatherRiskError,
  highestLevel,
  loadWeatherAlerts,
  loadWeatherRisk,
  parseWeatherRisk,
  type WeatherRisk,
  type WeatherRiskFailure,
} from '@/services/weatherRisk';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

const PLOT = { id: 'plot-1', latitude: 9.6611, longitude: -84.0225 };
const NOW = new Date('2026-11-15T12:00:00.000Z');

function client(request: jest.Mock, isConfigured = true): ApiClient {
  return { isConfigured, request: request as ApiClient['request'] };
}

async function expectFailure(promise: Promise<unknown>, reason: WeatherRiskFailure): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(WeatherRiskError);
  await promise.catch((error: WeatherRiskError) => expect(error.reason).toBe(reason));
}

function store(fetchedAt: Date, point = PLOT): void {
  const risk = parseWeatherRisk(RISK_PAYLOAD) as WeatherRisk;
  weatherRisksRepository.save(
    point.id,
    point.latitude,
    point.longitude,
    JSON.stringify(risk),
    fetchedAt.toISOString(),
  );
}

const deps = (request: jest.Mock, extra: object = {}) => ({
  client: client(request),
  isSignedIn: () => true,
  now: () => NOW,
  ...extra,
});

describe('weather risk service', () => {
  beforeEach(() => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
  });

  it('parses the API payload and rejects one without the CC BY attribution', () => {
    const risk = parseWeatherRisk(RISK_PAYLOAD);
    expect(risk?.risks[0]?.level).toBe('high');
    expect(risk?.risks[0]?.thresholds[1]).toEqual({
      name: 'level_mapping',
      basis: 'provisional',
      source: null,
    });
    expect(highestLevel(risk as WeatherRisk)).toBe('high');

    expect(parseWeatherRisk({ ...RISK_PAYLOAD, attribution: undefined })).toBeNull();
    expect(parseWeatherRisk({ ...RISK_PAYLOAD, risks: [{ crop: 'coffee' }] })).toBeNull();
  });

  it('accepts an insufficient-evidence risk without a level', () => {
    const sigatoka = {
      crop: 'banana',
      disease_class: 'black_sigatoka',
      status: 'insufficient_evidence',
      level: null,
      recent: null,
      upcoming: null,
      thresholds: [],
    };
    const risk = parseWeatherRisk({ ...RISK_PAYLOAD, risks: [sigatoka] });
    expect(risk?.risks[0]?.status).toBe('insufficient_evidence');
    expect(highestLevel(risk as WeatherRisk)).toBeNull();
  });

  it('fetches with the plot point, stores the answer and reuses it while fresh', async () => {
    const request = jest.fn().mockResolvedValue(RISK_PAYLOAD);

    const first = await loadWeatherRisk(PLOT, deps(request));
    expect(first.source).toBe('network');
    expect(request).toHaveBeenCalledWith(
      '/plots/plot-1/weather-risk?latitude=9.6611&longitude=-84.0225',
    );

    const second = await loadWeatherRisk(PLOT, deps(request));
    expect(second.source).toBe('cache');
    expect(request).toHaveBeenCalledTimes(1);

    await loadWeatherRisk(PLOT, deps(request, { force: true }));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('refetches an old answer and one stored for a different point', async () => {
    const request = jest.fn().mockResolvedValue(RISK_PAYLOAD);

    store(new Date(NOW.getTime() - FRESH_FOR_MS - 1));
    expect((await loadWeatherRisk(PLOT, deps(request))).source).toBe('network');

    store(NOW, { ...PLOT, latitude: 10 });
    expect((await loadWeatherRisk(PLOT, deps(request))).source).toBe('network');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stored answer, whatever its age, when the API fails', async () => {
    store(new Date('2026-11-01T00:00:00.000Z'));
    const request = jest.fn().mockRejectedValue(new ApiError(0, 'network'));

    const result = await loadWeatherRisk(PLOT, deps(request));

    expect(result.source).toBe('cache');
    expect(result.fetchedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it.each<[ApiError, WeatherRiskFailure]>([
    [new ApiError(0, 'network'), 'offline'],
    [new ApiError(404, 'plot_not_found'), 'notSynced'],
    [new ApiError(429, 'rate_limited'), 'rateLimited'],
    [new ApiError(503, 'weather_unavailable'), 'unavailable'],
  ])('maps %p to %p when nothing is stored', async (error, reason) => {
    await expectFailure(loadWeatherRisk(PLOT, deps(jest.fn().mockRejectedValue(error))), reason);
  });

  it('needs a location, a configured API and a signed-in user', async () => {
    const request = jest.fn();
    await expectFailure(
      loadWeatherRisk({ ...PLOT, latitude: null, longitude: null }, deps(request)),
      'noLocation',
    );
    await expectFailure(
      loadWeatherRisk(PLOT, { ...deps(request), client: client(request, false) }),
      'notConfigured',
    );
    await expectFailure(
      loadWeatherRisk(PLOT, { ...deps(request), isSignedIn: () => false }),
      'signedOut',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('lists moderate and high alerts of located plots, highest first', async () => {
    const plot = (id: string, latitude: number | null): Plot =>
      ({ id, name: id, crop: 'coffee', latitude, longitude: latitude && -84 }) as Plot;
    const risk = parseWeatherRisk(RISK_PAYLOAD) as WeatherRisk;
    const moderate: WeatherRisk = {
      ...risk,
      risks: risk.risks.map((r) => ({ ...r, level: 'moderate' as const })),
    };
    const low: WeatherRisk = {
      ...risk,
      risks: risk.risks.map((r) => ({ ...r, level: 'low' as const })),
    };
    const results: Record<string, WeatherRisk> = { a: moderate, b: risk, c: low };
    const load = jest.fn(async (p: { id: string }) => {
      if (p.id === 'd') throw new WeatherRiskError('notSynced');
      return { risk: results[p.id] as WeatherRisk, source: 'cache' as const, fetchedAt: '' };
    });

    const alerts = await loadWeatherAlerts(
      [plot('a', 9), plot('b', 9), plot('c', 9), plot('d', 9), plot('e', null)],
      load,
    );

    expect(alerts.map((alert) => [alert.plot.id, alert.level])).toEqual([
      ['b', 'high'],
      ['a', 'moderate'],
    ]);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

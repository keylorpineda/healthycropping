import * as SQLite from 'expo-sqlite';

import {
  initDatabase,
  plotNdviRepository,
  type PlotNdviRepository,
  type StoredPlotNdvi,
} from '@/db';
import { ApiError, type ApiClient } from '@/services/api';
import {
  FRESH_FOR_MS,
  NdviError,
  loadPlotNdvi,
  parsePlotNdvi,
  plotGeometryKey,
  type GeometryPlot,
  type NdviFailure,
  type PlotNdvi,
} from '@/services/ndvi';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

const NDVI_PAYLOAD = {
  plot_id: 'plot-1',
  source: 'point',
  collection: 'COPERNICUS/S2_SR_HARMONIZED',
  months: [
    {
      month: '2025-11',
      ndvi: 0.72,
      clear_fraction: 0.65,
      images: 4,
      status: 'ok',
      cached: true,
    },
    {
      month: '2025-12',
      ndvi: 0.75,
      clear_fraction: 0.78,
      images: 5,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-01',
      ndvi: 0.79,
      clear_fraction: 0.84,
      images: 6,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-02',
      ndvi: 0.77,
      clear_fraction: 0.81,
      images: 5,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-03',
      ndvi: 0.74,
      clear_fraction: 0.7,
      images: 5,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-04',
      ndvi: 0.69,
      clear_fraction: 0.52,
      images: 4,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-05',
      ndvi: null,
      clear_fraction: 0.12,
      images: 3,
      status: 'cloudy',
      cached: true,
    },
    {
      month: '2026-06',
      ndvi: 0.66,
      clear_fraction: 0.38,
      images: 4,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-07',
      ndvi: 0.71,
      clear_fraction: 0.49,
      images: 5,
      status: 'ok',
      cached: true,
    },
    {
      month: '2026-08',
      ndvi: null,
      clear_fraction: 0,
      images: 0,
      status: 'no_data',
      cached: true,
    },
    {
      month: '2026-09',
      ndvi: null,
      clear_fraction: 0.15,
      images: 2,
      status: 'cloudy',
      cached: false,
    },
    {
      month: '2026-10',
      ndvi: 0.73,
      clear_fraction: 0.61,
      images: 4,
      status: 'ok',
      cached: false,
    },
  ],
  attribution: 'Contains modified Copernicus Sentinel data, processed with Google Earth Engine.',
};

const PLOT: GeometryPlot = {
  id: 'plot-1',
  boundary_geojson: null,
  latitude: 9.6611,
  longitude: -84.0225,
};
const NOW = new Date('2026-11-15T12:00:00.000Z');

function client(request: jest.Mock, isConfigured = true): ApiClient {
  return { isConfigured, request: request as ApiClient['request'] };
}

function createFakeRepository(initial?: StoredPlotNdvi): PlotNdviRepository & {
  rows: Map<string, StoredPlotNdvi>;
} {
  const rows = new Map<string, StoredPlotNdvi>();
  if (initial) {
    rows.set(initial.id, initial);
  }
  return {
    rows,
    get(plotId: string): StoredPlotNdvi | null {
      return rows.get(plotId) ?? null;
    },
    save(
      plotId: string,
      geometryKey: string,
      responseJson: string,
      fetchedAt = new Date().toISOString(),
    ): void {
      rows.set(plotId, {
        id: plotId,
        geometry_key: geometryKey,
        response_json: responseJson,
        fetched_at: fetchedAt,
      });
    },
  };
}

async function expectFailure(promise: Promise<unknown>, reason: NdviFailure): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(NdviError);
  await promise.catch((error: NdviError) => expect(error.reason).toBe(reason));
}

function store(repository: PlotNdviRepository, fetchedAt: Date, plot: GeometryPlot = PLOT): void {
  const ndvi = parsePlotNdvi(NDVI_PAYLOAD) as PlotNdvi;
  const key = plotGeometryKey(plot) as string;
  repository.save(plot.id, key, JSON.stringify(ndvi), fetchedAt.toISOString());
}

const deps = (request: jest.Mock, repository: PlotNdviRepository, extra: object = {}) => ({
  client: client(request),
  repository,
  isSignedIn: () => true,
  now: () => NOW,
  ...extra,
});

describe('ndvi service', () => {
  beforeEach(() => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
  });

  it('parses the 12-month API payload, defaults cached to false and rejects invalid fields', () => {
    const ndvi = parsePlotNdvi(NDVI_PAYLOAD);
    expect(ndvi?.months).toHaveLength(12);
    expect(ndvi?.months[0]?.status).toBe('ok');
    expect(ndvi?.months[6]?.status).toBe('cloudy');
    expect(ndvi?.months[9]?.status).toBe('no_data');

    const withoutCached = {
      ...NDVI_PAYLOAD,
      months: [
        {
          month: '2026-10',
          ndvi: 0.73,
          clear_fraction: 0.61,
          images: 4,
          status: 'ok',
        },
      ],
    };
    expect(parsePlotNdvi(withoutCached)?.months[0]?.cached).toBe(false);

    expect(parsePlotNdvi({ ...NDVI_PAYLOAD, attribution: undefined })).toBeNull();
    expect(parsePlotNdvi({ ...NDVI_PAYLOAD, attribution: '   ' })).toBeNull();
    expect(
      parsePlotNdvi({
        ...NDVI_PAYLOAD,
        months: [{ ...NDVI_PAYLOAD.months[0], ndvi: 1.5 }],
      }),
    ).toBeNull();
    expect(
      parsePlotNdvi({
        ...NDVI_PAYLOAD,
        months: [{ ...NDVI_PAYLOAD.months[0], month: '2026-1' }],
      }),
    ).toBeNull();
    expect(
      parsePlotNdvi({
        ...NDVI_PAYLOAD,
        months: [{ ...NDVI_PAYLOAD.months[0], status: 'foo' }],
      }),
    ).toBeNull();
  });

  it('builds a geometry key for boundary, point and unlocated plots', () => {
    const geojson = '{"type":"Polygon","coordinates":[[[-84,9],[-84,10],[-83,10],[-84,9]]]}';
    expect(
      plotGeometryKey({
        boundary_geojson: geojson,
        latitude: 9.6611,
        longitude: -84.0225,
      }),
    ).toBe(`boundary:${geojson}`);
    expect(
      plotGeometryKey({
        boundary_geojson: null,
        latitude: 9.6611,
        longitude: -84.0225,
      }),
    ).toBe('point:9.6611,-84.0225');
    expect(
      plotGeometryKey({
        boundary_geojson: null,
        latitude: null,
        longitude: null,
      }),
    ).toBeNull();
  });

  it('fetches, stores the answer and reuses it while fresh unless forced', async () => {
    const request = jest.fn().mockResolvedValue(NDVI_PAYLOAD);
    const repository = createFakeRepository();

    const first = await loadPlotNdvi(PLOT, deps(request, repository));
    expect(first.source).toBe('network');
    expect(request).toHaveBeenCalledWith('/plots/plot-1/ndvi');
    expect(repository.get('plot-1')?.geometry_key).toBe('point:9.6611,-84.0225');

    const second = await loadPlotNdvi(PLOT, deps(request, repository));
    expect(second.source).toBe('cache');
    expect(request).toHaveBeenCalledTimes(1);

    const forced = await loadPlotNdvi(PLOT, deps(request, repository, { force: true }));
    expect(forced.source).toBe('network');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('refetches a stale stored answer and ignores one for a changed geometry', async () => {
    const request = jest.fn().mockResolvedValue(NDVI_PAYLOAD);
    const repository = createFakeRepository();

    store(repository, new Date(NOW.getTime() - FRESH_FOR_MS - 1));
    const refetched = await loadPlotNdvi(PLOT, deps(request, repository));
    expect(refetched.source).toBe('network');
    expect(repository.get('plot-1')?.fetched_at).toBe(NOW.toISOString());

    store(repository, NOW, { ...PLOT, latitude: 10 });
    expect((await loadPlotNdvi(PLOT, deps(request, repository))).source).toBe('network');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('falls back to a stale stored answer when offline', async () => {
    const repository = createFakeRepository();
    store(repository, new Date('2026-11-01T00:00:00.000Z'));
    const request = jest.fn().mockRejectedValue(new ApiError(0, 'network'));

    const result = await loadPlotNdvi(PLOT, deps(request, repository));

    expect(result.source).toBe('cache');
    expect(result.fetchedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it.each<[ApiError, NdviFailure]>([
    [new ApiError(0, 'not-configured'), 'notConfigured'],
    [new ApiError(0, 'network'), 'offline'],
    [new ApiError(401, 'unauthorized'), 'signedOut'],
    [new ApiError(404, 'plot_not_found'), 'notSynced'],
    [new ApiError(422, 'plot_not_located'), 'noLocation'],
    [new ApiError(429, 'rate_limited'), 'rateLimited'],
    [new ApiError(503, 'ndvi_quota_exceeded'), 'quotaExceeded'],
    [new ApiError(503, 'ndvi_not_configured'), 'serverNotConfigured'],
    [new ApiError(503, 'ndvi_unavailable'), 'unavailable'],
  ])('maps %p to %p when nothing is stored', async (error, reason) => {
    const repository = createFakeRepository();
    await expectFailure(
      loadPlotNdvi(PLOT, deps(jest.fn().mockRejectedValue(error), repository)),
      reason,
    );
  });

  it('needs a geometry, a configured API and a signed-in user', async () => {
    const request = jest.fn();
    const repository = createFakeRepository();
    await expectFailure(
      loadPlotNdvi(
        { id: 'plot-1', boundary_geojson: null, latitude: null, longitude: null },
        deps(request, repository),
      ),
      'noLocation',
    );
    await expectFailure(
      loadPlotNdvi(PLOT, { ...deps(request, repository), client: client(request, false) }),
      'notConfigured',
    );
    await expectFailure(
      loadPlotNdvi(PLOT, { ...deps(request, repository), isSignedIn: () => false }),
      'signedOut',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('stores and replaces answers in the SQLite plotNdviRepository', () => {
    plotNdviRepository.save(
      'plot-1',
      'point:9.6611,-84.0225',
      JSON.stringify(NDVI_PAYLOAD),
      '2026-11-15T00:00:00.000Z',
    );
    expect(plotNdviRepository.get('plot-1')?.geometry_key).toBe('point:9.6611,-84.0225');

    plotNdviRepository.save(
      'plot-1',
      'boundary:{"type":"Polygon"}',
      JSON.stringify(NDVI_PAYLOAD),
      '2026-11-16T00:00:00.000Z',
    );
    expect(plotNdviRepository.get('plot-1')).toEqual({
      id: 'plot-1',
      geometry_key: 'boundary:{"type":"Polygon"}',
      response_json: JSON.stringify(NDVI_PAYLOAD),
      fetched_at: '2026-11-16T00:00:00.000Z',
    });
  });
});

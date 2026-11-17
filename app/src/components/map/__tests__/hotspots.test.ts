import {
  countBySeverity,
  DEFAULT_HOTSPOT_FILTERS,
  distinctValues,
  filterHotspots,
  hotspotFeatures,
  type LocatedScan,
  mappableScans,
} from '@/components/map/hotspots';
import { type Scan } from '@/db';

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 'scan-1',
    farm_id: 'farm-1',
    plot_id: 'plot-1',
    crop: 'coffee',
    predicted_class: 'leaf_rust',
    severity: 'actNow',
    confidence: 0.92,
    threshold: 0.7,
    is_low_confidence: 0,
    model_version: '0.1.0',
    local_photo_uri: 'file:///mock/scan.jpg',
    cloudinary_public_id: null,
    latitude: 9.662,
    longitude: -84.022,
    explanation_json: null,
    scanned_at: '2026-11-10T12:00:00.000Z',
    updated_at: '2026-11-10T12:00:00.000Z',
    deleted_at: null,
    sync_status: 'pending',
    ...overrides,
  };
}

function makeLocatedScan(overrides: Partial<LocatedScan> = {}): LocatedScan {
  return {
    ...makeScan(overrides),
    latitude: overrides.latitude ?? 9.662,
    longitude: overrides.longitude ?? -84.022,
  };
}

describe('hotspots helpers', () => {
  it('mappableScans drops deleted, low-confidence, and unlocated scans', () => {
    const valid = makeScan({ id: 'valid' });
    const deleted = makeScan({ id: 'deleted', deleted_at: '2026-11-11T00:00:00.000Z' });
    const lowConf = makeScan({ id: 'low-conf', is_low_confidence: 1 });
    const noLat = makeScan({ id: 'no-lat', latitude: null });
    const noLon = makeScan({ id: 'no-lon', longitude: null });

    const result = mappableScans([valid, deleted, lowConf, noLat, noLon]);

    expect(result).toEqual([valid]);
  });

  it('filterHotspots filters by crop, predictedClass, range 30d with fixed now, and all', () => {
    const now = new Date('2026-11-20T00:00:00.000Z');
    const tenDaysOld = makeLocatedScan({
      id: 'scan-10d',
      crop: 'coffee',
      predicted_class: 'leaf_rust',
      scanned_at: '2026-11-10T00:00:00.000Z',
    });
    const fortyDaysOld = makeLocatedScan({
      id: 'scan-40d',
      crop: 'cacao',
      predicted_class: 'monilia',
      scanned_at: '2026-10-11T00:00:00.000Z',
    });
    const scans: LocatedScan[] = [tenDaysOld, fortyDaysOld];

    expect(
      filterHotspots(scans, { ...DEFAULT_HOTSPOT_FILTERS, range: 'all', crop: 'coffee' }, now),
    ).toEqual([tenDaysOld]);

    expect(
      filterHotspots(
        scans,
        { ...DEFAULT_HOTSPOT_FILTERS, range: 'all', predictedClass: 'monilia' },
        now,
      ),
    ).toEqual([fortyDaysOld]);

    expect(filterHotspots(scans, { ...DEFAULT_HOTSPOT_FILTERS, range: '30d' }, now)).toEqual([
      tenDaysOld,
    ]);

    expect(filterHotspots(scans, { ...DEFAULT_HOTSPOT_FILTERS, range: 'all' }, now)).toEqual([
      tenDaysOld,
      fortyDaysOld,
    ]);
  });

  it('hotspotFeatures emits Point features with [longitude, latitude] and severity/rank properties', () => {
    const scans: LocatedScan[] = [
      makeLocatedScan({
        id: 's-act',
        severity: 'actNow',
        predicted_class: 'leaf_rust',
        latitude: 9.66,
        longitude: -84.02,
      }),
      makeLocatedScan({
        id: 's-watch',
        severity: 'watch',
        predicted_class: 'cercospora',
        latitude: 9.67,
        longitude: -84.03,
      }),
      makeLocatedScan({
        id: 's-healthy',
        severity: 'healthy',
        predicted_class: 'healthy',
        latitude: 9.68,
        longitude: -84.04,
      }),
    ];

    const collection = hotspotFeatures(scans);

    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toEqual([
      {
        type: 'Feature',
        id: 's-act',
        properties: {
          scanId: 's-act',
          severity: 'actNow',
          rank: 2,
          predictedClass: 'leaf_rust',
        },
        geometry: { type: 'Point', coordinates: [-84.02, 9.66] },
      },
      {
        type: 'Feature',
        id: 's-watch',
        properties: {
          scanId: 's-watch',
          severity: 'watch',
          rank: 1,
          predictedClass: 'cercospora',
        },
        geometry: { type: 'Point', coordinates: [-84.03, 9.67] },
      },
      {
        type: 'Feature',
        id: 's-healthy',
        properties: {
          scanId: 's-healthy',
          severity: 'healthy',
          rank: 0,
          predictedClass: 'healthy',
        },
        geometry: { type: 'Point', coordinates: [-84.04, 9.68] },
      },
    ]);
  });

  it('countBySeverity tallies scans by severity level', () => {
    const scans: LocatedScan[] = [
      makeLocatedScan({ id: '1', severity: 'actNow' }),
      makeLocatedScan({ id: '2', severity: 'watch' }),
      makeLocatedScan({ id: '3', severity: 'watch' }),
      makeLocatedScan({ id: '4', severity: 'healthy' }),
    ];

    expect(countBySeverity(scans)).toEqual({
      actNow: 1,
      watch: 2,
      healthy: 1,
    });
  });

  it('distinctValues keeps first-seen order without duplicates', () => {
    const scans: LocatedScan[] = [
      makeLocatedScan({ id: '1', crop: 'cacao', predicted_class: 'monilia' }),
      makeLocatedScan({ id: '2', crop: 'coffee', predicted_class: 'leaf_rust' }),
      makeLocatedScan({ id: '3', crop: 'cacao', predicted_class: 'black_pod' }),
      makeLocatedScan({ id: '4', crop: 'coffee', predicted_class: 'monilia' }),
    ];

    expect(distinctValues(scans, 'crop')).toEqual(['cacao', 'coffee']);
    expect(distinctValues(scans, 'predicted_class')).toEqual(['monilia', 'leaf_rust', 'black_pod']);
  });
});

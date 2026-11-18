import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { type BoundaryPoint, boundaryToGeoJson, type Plot } from '@/db';
import {
  captureScanLocation,
  isScanLocationEnabled,
  plotContaining,
  pointInBoundary,
  SCAN_LOCATION_KEY,
  setScanLocationEnabled,
} from '@/services/scanLocation';

function permissionResult(granted: boolean): Location.LocationPermissionResponse {
  return {
    granted,
    status: (granted ? 'granted' : 'denied') as Location.PermissionStatus,
    expires: 'never',
    canAskAgain: true,
  };
}

function makeFix(
  latitude: number,
  longitude: number,
  accuracy: number | null,
): Location.LocationObject {
  return {
    coords: {
      latitude,
      longitude,
      altitude: null,
      accuracy,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 1_700_000_000_000,
  };
}

const SQUARE_RING: BoundaryPoint[] = [
  { latitude: 9.66, longitude: -84.024 },
  { latitude: 9.66, longitude: -84.02 },
  { latitude: 9.664, longitude: -84.02 },
  { latitude: 9.664, longitude: -84.024 },
];

const INSIDE_POINT: BoundaryPoint = { latitude: 9.662, longitude: -84.022 };
const OUTSIDE_POINT: BoundaryPoint = { latitude: 9.67, longitude: -84.022 };

function makePlot(overrides: Partial<Plot> = {}): Plot {
  return {
    id: 'plot-1',
    farm_id: 'farm-1',
    name: 'Lote Norte',
    crop: 'coffee',
    area_ha: 1.5,
    latitude: 9.662,
    longitude: -84.022,
    boundary_geojson: boundaryToGeoJson(SQUARE_RING),
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    deleted_at: null,
    sync_status: 'pending',
    ...overrides,
  };
}

describe('scanLocation service', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('isScanLocationEnabled and setScanLocationEnabled', () => {
    it('is false by default', async () => {
      await expect(isScanLocationEnabled()).resolves.toBe(false);
    });

    it('enables scan location when foreground permission is granted and persists true', async () => {
      jest
        .mocked(Location.requestForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(true));

      const result = await setScanLocationEnabled(true);

      expect(result).toBe(true);
      expect(await AsyncStorage.getItem(SCAN_LOCATION_KEY)).toBe('true');
      await expect(isScanLocationEnabled()).resolves.toBe(true);
    });

    it('stays disabled when foreground permission is denied and persists false', async () => {
      jest
        .mocked(Location.requestForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(false));

      const result = await setScanLocationEnabled(true);

      expect(result).toBe(false);
      expect(await AsyncStorage.getItem(SCAN_LOCATION_KEY)).toBe('false');
      await expect(isScanLocationEnabled()).resolves.toBe(false);
    });

    it('disables scan location without requesting permission', async () => {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');

      const result = await setScanLocationEnabled(false);

      expect(result).toBe(false);
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(SCAN_LOCATION_KEY)).toBe('false');
    });
  });

  describe('captureScanLocation', () => {
    it('returns null when disabled and does not check foreground permissions', async () => {
      const point = await captureScanLocation();

      expect(point).toBeNull();
      expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns null when enabled but permission is no longer granted', async () => {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');
      jest
        .mocked(Location.getForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(false));

      const point = await captureScanLocation();

      expect(point).toBeNull();
      expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
    });

    it('returns the last known fix when it is accurate', async () => {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');
      jest
        .mocked(Location.getForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(true));
      jest
        .mocked(Location.getLastKnownPositionAsync)
        .mockResolvedValueOnce(makeFix(9.662, -84.022, 20));

      const point = await captureScanLocation();

      expect(point).toEqual({ latitude: 9.662, longitude: -84.022 });
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it('falls back to getCurrentPositionAsync when the last known fix is null', async () => {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');
      jest
        .mocked(Location.getForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(true));
      jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce(null);
      jest
        .mocked(Location.getCurrentPositionAsync)
        .mockResolvedValueOnce(makeFix(9.663, -84.021, 15));

      const point = await captureScanLocation();

      expect(point).toEqual({ latitude: 9.663, longitude: -84.021 });
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    });

    it('returns null when accuracy is 250 (above MAX_ACCURACY_M)', async () => {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');
      jest
        .mocked(Location.getForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(true));
      jest
        .mocked(Location.getLastKnownPositionAsync)
        .mockResolvedValueOnce(makeFix(9.662, -84.022, 250));
      jest
        .mocked(Location.getCurrentPositionAsync)
        .mockResolvedValueOnce(makeFix(9.662, -84.022, 250));

      const point = await captureScanLocation();

      expect(point).toBeNull();
    });

    it.each([null, NaN, Infinity, -1])(
      'rejects a location whose accuracy cannot be verified (%p)',
      async (accuracy) => {
        await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');
        jest
          .mocked(Location.getForegroundPermissionsAsync)
          .mockResolvedValueOnce(permissionResult(true));
        jest
          .mocked(Location.getLastKnownPositionAsync)
          .mockResolvedValueOnce(makeFix(9.662, -84.022, accuracy));
        jest
          .mocked(Location.getCurrentPositionAsync)
          .mockResolvedValueOnce(makeFix(9.662, -84.022, accuracy));

        await expect(captureScanLocation()).resolves.toBeNull();
      },
    );

    it('returns null without throwing when getCurrentPositionAsync rejects', async () => {
      await AsyncStorage.setItem(SCAN_LOCATION_KEY, 'true');
      jest
        .mocked(Location.getForegroundPermissionsAsync)
        .mockResolvedValueOnce(permissionResult(true));
      jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce(null);
      jest
        .mocked(Location.getCurrentPositionAsync)
        .mockRejectedValueOnce(new Error('GPS unavailable'));

      await expect(captureScanLocation()).resolves.toBeNull();
    });
  });

  describe('pointInBoundary', () => {
    it('identifies points inside and outside a polygon, including the notch of a concave L-shaped ring', () => {
      expect(pointInBoundary(INSIDE_POINT, SQUARE_RING)).toBe(true);
      expect(pointInBoundary(OUTSIDE_POINT, SQUARE_RING)).toBe(false);

      const lShapeRing: BoundaryPoint[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 10 },
        { latitude: 4, longitude: 10 },
        { latitude: 4, longitude: 4 },
        { latitude: 10, longitude: 4 },
        { latitude: 10, longitude: 0 },
      ];

      expect(pointInBoundary({ latitude: 2, longitude: 2 }, lShapeRing)).toBe(true);
      expect(pointInBoundary({ latitude: 6, longitude: 6 }, lShapeRing)).toBe(false);
    });
  });

  describe('plotContaining', () => {
    it('returns the single matching plot of the same crop', () => {
      const plot = makePlot();
      expect(plotContaining(INSIDE_POINT, 'coffee', [plot])).toEqual(plot);
    });

    it('returns null when the crop differs', () => {
      const plot = makePlot({ crop: 'cacao' });
      expect(plotContaining(INSIDE_POINT, 'coffee', [plot])).toBeNull();
    });

    it('returns null when the plot is deleted', () => {
      const plot = makePlot({ deleted_at: '2026-11-02T00:00:00.000Z' });
      expect(plotContaining(INSIDE_POINT, 'coffee', [plot])).toBeNull();
    });

    it('returns null when two overlapping plots of the crop both contain the point', () => {
      const plotA = makePlot({ id: 'plot-a' });
      const plotB = makePlot({ id: 'plot-b' });
      expect(plotContaining(INSIDE_POINT, 'coffee', [plotA, plotB])).toBeNull();
    });

    it('returns null when no plot has a boundary', () => {
      const plot = makePlot({ boundary_geojson: null });
      expect(plotContaining(INSIDE_POINT, 'coffee', [plot])).toBeNull();
    });
  });
});

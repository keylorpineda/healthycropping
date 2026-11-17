import { OfflineManager } from '@maplibre/maplibre-react-native';

/**
 * OpenStreetMap raster tiles for the plot map (#41).
 *
 * Offline use relies on MapLibre's ambient cache: tiles the farmer has already viewed stay on
 * the device and render without a connection. The OSM tile usage policy forbids bulk
 * prefetching of areas, so the app never downloads offline packs from tile.openstreetmap.org.
 */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
} as const;

/** Room for the tiles of a few farms at field zoom levels. */
export const AMBIENT_CACHE_BYTES = 64 * 1024 * 1024;

/** Costa Rica, the first market; used when a plot has no point or boundary yet. */
export const DEFAULT_CENTER: [number, number] = [-84.1, 9.9];
export const DEFAULT_ZOOM = 7;
export const PLOT_ZOOM = 16;

let cacheConfigured: Promise<void> | null = null;

/** Sets the ambient tile cache size once per app run; failures leave MapLibre's default. */
export function configureTileCache(): Promise<void> {
  if (!cacheConfigured) {
    cacheConfigured = OfflineManager.setMaximumAmbientCacheSize(AMBIENT_CACHE_BYTES).catch(
      () => undefined,
    );
  }
  return cacheConfigured;
}

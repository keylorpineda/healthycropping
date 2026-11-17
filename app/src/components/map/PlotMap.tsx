import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  ShapeSource,
} from '@maplibre/maplibre-react-native';

import { type BoundaryPoint, normalizeBoundary } from '@/db';
import { useTheme } from '@/theme';

import {
  configureTileCache,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_STYLE,
  PLOT_ZOOM,
} from './osmStyle';

export interface PlotMapProps {
  /** Vertices drawn so far; the polygon fills once there are three. */
  boundary?: readonly BoundaryPoint[] | null;
  /** Plot reference point, used to center the map when there is no boundary. */
  center?: BoundaryPoint | null;
  /** Tap handler; when set the map is an editor and every tap adds a vertex. */
  onPressPoint?: (point: BoundaryPoint) => void;
  /** Extra MapLibre layers drawn above the boundary (hotspots in #77). */
  children?: React.ReactNode;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type Bounds = { ne: [number, number]; sw: [number, number] };

function boundsOf(points: readonly BoundaryPoint[]): Bounds {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    ne: [Math.max(...longitudes), Math.max(...latitudes)],
    sw: [Math.min(...longitudes), Math.min(...latitudes)],
  };
}

function boundaryShape(points: readonly BoundaryPoint[]): GeoJSON.FeatureCollection {
  const ring: GeoJSON.Position[] = points.map((point) => [point.longitude, point.latitude]);
  const closed = ring.length > 0 ? [...ring, ring[0] as GeoJSON.Position] : ring;
  const features: GeoJSON.Feature[] = points.map((point, index) => ({
    type: 'Feature',
    id: `vertex-${index}`,
    properties: { kind: 'vertex' },
    geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
  }));
  if (ring.length >= 2) {
    features.push({
      type: 'Feature',
      id: 'outline',
      properties: { kind: 'outline' },
      geometry: {
        type: 'LineString',
        coordinates: ring.length >= 3 ? closed : ring,
      },
    });
  }
  if (ring.length >= 3) {
    features.push({
      type: 'Feature',
      id: 'area',
      properties: { kind: 'area' },
      geometry: { type: 'Polygon', coordinates: [closed] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** OpenStreetMap view of one plot: its boundary polygon, vertices and optional overlays. */
export function PlotMap({
  boundary,
  center,
  onPressPoint,
  children,
  accessibilityLabel,
  style,
  testID = 'plot-map',
}: PlotMapProps): React.JSX.Element {
  const theme = useTheme();
  const points = useMemo(() => normalizeBoundary(boundary ?? []), [boundary]);
  const shape = useMemo(() => boundaryShape(points), [points]);

  useEffect(() => {
    void configureTileCache();
  }, []);

  // Only frame the saved shape: refitting on every tap would fight the farmer's zoom.
  const [initialBounds] = useState<Bounds | null>(() =>
    boundary && boundary.length >= 2 ? boundsOf(normalizeBoundary(boundary)) : null,
  );
  const camera = initialBounds ? (
    <Camera
      defaultSettings={{
        bounds: initialBounds,
        padding: { paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 },
      }}
    />
  ) : (
    <Camera
      defaultSettings={{
        centerCoordinate: center ? [center.longitude, center.latitude] : DEFAULT_CENTER,
        zoomLevel: center ? PLOT_ZOOM : DEFAULT_ZOOM,
      }}
    />
  );

  const handlePress = (feature: GeoJSON.Feature) => {
    if (!onPressPoint || feature.geometry.type !== 'Point') return;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (longitude === undefined || latitude === undefined) return;
    onPressPoint({ latitude, longitude });
  };

  const accent = theme.colors.primary;

  return (
    <View
      style={[styles.container, style]}
      accessible={!onPressPoint}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <MapView
        style={styles.map}
        mapStyle={OSM_STYLE}
        attributionEnabled={false}
        logoEnabled={false}
        {...(onPressPoint ? { onPress: handlePress } : {})}
        testID={`${testID}-view`}
      >
        {camera}
        <ShapeSource id="plot-boundary" shape={shape}>
          <FillLayer
            id="plot-boundary-fill"
            filter={['==', ['get', 'kind'], 'area']}
            style={{ fillColor: accent, fillOpacity: 0.2 }}
          />
          <LineLayer
            id="plot-boundary-line"
            filter={['==', ['get', 'kind'], 'outline']}
            style={{ lineColor: accent, lineWidth: 3 }}
          />
          <CircleLayer
            id="plot-boundary-vertices"
            filter={['==', ['get', 'kind'], 'vertex']}
            style={{
              circleColor: theme.colors.surface,
              circleRadius: 6,
              circleStrokeColor: accent,
              circleStrokeWidth: 2,
            }}
          />
        </ShapeSource>
        {children}
      </MapView>
      {/* Visible attribution is a condition of the OSM tile licence (ODbL). */}
      <Text
        style={[
          theme.typography.caption,
          styles.attribution,
          { backgroundColor: theme.colors.surface, color: theme.colors.textSecondary },
        ]}
        testID={`${testID}-attribution`}
      >
        {OSM_ATTRIBUTION}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  map: {
    flex: 1,
  },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    opacity: 0.9,
  },
});

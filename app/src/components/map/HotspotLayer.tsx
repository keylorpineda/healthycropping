import React, { useMemo } from 'react';
import { CircleLayer, type Expression, ShapeSource } from '@maplibre/maplibre-react-native';

import { useTheme } from '@/theme';

import { hotspotFeatures, type LocatedScan } from './hotspots';

export interface HotspotLayerProps {
  scans: readonly LocatedScan[];
}

/**
 * Clustered scan markers coloured by status badge (#77). A cluster takes the worst status of
 * its scans (`maxRank`) and grows with its size. Counts are not drawn as text because the
 * OSM raster style has no glyph server; the legend below the map gives the totals.
 */
export function HotspotLayer({ scans }: HotspotLayerProps): React.JSX.Element {
  const theme = useTheme();
  const shape = useMemo(() => hotspotFeatures(scans), [scans]);
  const { healthy, watch, actNow } = theme.colors.status;

  const colorByRank = (rank: Expression): Expression => [
    'match',
    rank,
    2,
    actNow.main,
    1,
    watch.main,
    healthy.main,
  ];

  return (
    <ShapeSource
      id="scan-hotspots"
      shape={shape}
      cluster
      clusterRadius={40}
      clusterMaxZoomLevel={18}
      clusterProperties={{ maxRank: ['max', ['get', 'rank']] }}
    >
      <CircleLayer
        id="scan-hotspot-clusters"
        filter={['has', 'point_count']}
        style={{
          circleColor: colorByRank(['get', 'maxRank']),
          circleOpacity: 0.85,
          circleRadius: ['step', ['get', 'point_count'], 14, 5, 18, 15, 24],
          circleStrokeColor: theme.colors.surface,
          circleStrokeWidth: 2,
        }}
      />
      <CircleLayer
        id="scan-hotspot-points"
        filter={['!', ['has', 'point_count']]}
        style={{
          circleColor: colorByRank(['get', 'rank']),
          circleRadius: 8,
          circleStrokeColor: theme.colors.surface,
          circleStrokeWidth: 2,
        }}
      />
    </ShapeSource>
  );
}

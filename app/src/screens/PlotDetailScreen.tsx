import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_HOTSPOT_FILTERS,
  filterHotspots,
  HotspotControls,
  type HotspotFilters,
  HotspotLayer,
  mappableScans,
  PlotMap,
} from '@/components/map';
import { Badge, Button, Card, EmptyState, TextField } from '@/components/ui';
import { NdviCard } from '@/components/ndvi';
import { WeatherRiskCard } from '@/components/weather';
import {
  farmsRepository,
  parseBoundaryGeoJson,
  parsePlotLocation,
  plotsRepository,
  scansRepository,
  type Plot,
  type PlotLocationError,
} from '@/db';
import { useTheme } from '@/theme';

export interface PlotDetailScreenProps {
  plotId: string;
  onBack?: () => void;
  /** Opens the boundary editor (#41). */
  onOpenMap?: () => void;
  testID?: string;
}

function coordinateText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** One plot: its data, its location point and the weather disease risk for it (#79). */
export function PlotDetailScreen({
  plotId,
  onBack,
  onOpenMap,
  testID = 'plot-detail-screen',
}: PlotDetailScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [plot, setPlot] = useState<Plot | null>(() => plotsRepository.getById(plotId));
  const farm = plot ? farmsRepository.getById(plot.farm_id) : null;

  const [editing, setEditing] = useState<boolean>(false);
  const [latitude, setLatitude] = useState<string>(coordinateText(plot?.latitude ?? null));
  const [longitude, setLongitude] = useState<string>(coordinateText(plot?.longitude ?? null));
  const [locationError, setLocationError] = useState<PlotLocationError | null>(null);
  const [hotspotFilters, setHotspotFilters] = useState<HotspotFilters>(DEFAULT_HOTSPOT_FILTERS);
  const locatedScans = useMemo(
    () => (plot ? mappableScans(scansRepository.getAll({ plot_id: plot.id })) : []),
    [plot],
  );
  const hotspots = useMemo(
    () => filterHotspots(locatedScans, hotspotFilters),
    [locatedScans, hotspotFilters],
  );

  const startEditing = () => {
    setLatitude(coordinateText(plot?.latitude ?? null));
    setLongitude(coordinateText(plot?.longitude ?? null));
    setLocationError(null);
    setEditing(true);
  };

  const saveLocation = () => {
    if (!plot) return;
    const location = parsePlotLocation(latitude, longitude);
    if (!location.ok) {
      setLocationError(location.error);
      return;
    }
    // Saved as pending; the sync engine pushes it with PATCH /plots/{id}.
    setPlot(
      plotsRepository.update(plot.id, {
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    );
    setEditing(false);
  };

  const header = (
    <View style={styles.header}>
      {onBack && (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.backButton}
          testID="plot-detail-back-btn"
        >
          <Text
            importantForAccessibility="no"
            accessible={false}
            style={[theme.typography.title3, { color: theme.colors.textPrimary }]}
          >
            ←
          </Text>
        </Pressable>
      )}
      <Text
        style={[theme.typography.title2, styles.title, { color: theme.colors.textPrimary }]}
        testID="plot-detail-title"
      >
        {plot?.name ?? t('plotDetail.title')}
      </Text>
    </View>
  );

  if (!plot || plot.deleted_at !== null) {
    return (
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.colors.background }]}
        testID={testID}
      >
        {header}
        <EmptyState
          title={t('plotDetail.notFound')}
          description={t('plotDetail.notFoundDescription')}
          testID="plot-detail-not-found"
        />
      </SafeAreaView>
    );
  }

  const point =
    plot.latitude !== null && plot.longitude !== null
      ? { latitude: plot.latitude, longitude: plot.longitude }
      : null;
  const located = point !== null;
  const boundary = parseBoundaryGeoJson(plot.boundary_geojson);
  const muted = [theme.typography.subhead, { color: theme.colors.textSecondary }];

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Card variant="outlined" style={styles.card} testID="plot-detail-info">
          <View style={styles.row}>
            <Badge label={t(`crops.${plot.crop}`)} variant={plot.crop} size="sm" />
            {farm && <Text style={[muted, styles.farmName]}>{farm.name}</Text>}
          </View>
          {plot.area_ha !== null && (
            <Text style={[muted, styles.line]} testID="plot-detail-area">
              {`${t('farms.areaHa')}: ${plot.area_ha}`}
            </Text>
          )}
          <Text style={[muted, styles.line]} testID="plot-detail-location">
            {located
              ? t('plotDetail.location', { latitude: plot.latitude, longitude: plot.longitude })
              : t('plotDetail.noLocation')}
          </Text>

          {editing ? (
            <View testID="plot-detail-location-form">
              <View style={styles.fields}>
                <TextField
                  label={t('farms.latitude')}
                  value={latitude}
                  onChangeText={(text) => {
                    setLatitude(text);
                    setLocationError(null);
                  }}
                  placeholder="e.g. 9.6611"
                  keyboardType="numbers-and-punctuation"
                  style={styles.field}
                  testID="plot-detail-latitude-input"
                />
                <TextField
                  label={t('farms.longitude')}
                  value={longitude}
                  onChangeText={(text) => {
                    setLongitude(text);
                    setLocationError(null);
                  }}
                  placeholder="e.g. -84.0225"
                  keyboardType="numbers-and-punctuation"
                  style={styles.field}
                  testID="plot-detail-longitude-input"
                />
              </View>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: locationError
                      ? theme.colors.status.actNow.main
                      : theme.colors.textTertiary,
                  },
                ]}
                accessibilityLiveRegion={locationError ? 'polite' : 'none'}
                testID="plot-detail-location-hint"
              >
                {t(locationError ? `farms.${locationError}` : 'farms.locationHint')}
              </Text>
              <View style={styles.buttons}>
                <Button
                  title={t('farms.save')}
                  onPress={saveLocation}
                  variant="primary"
                  size="sm"
                  testID="plot-detail-save-location-btn"
                />
                <View style={styles.buttonGap} />
                <Button
                  title={t('common.cancel')}
                  onPress={() => setEditing(false)}
                  variant="outline"
                  size="sm"
                  testID="plot-detail-cancel-location-btn"
                />
              </View>
            </View>
          ) : (
            <View style={styles.buttons}>
              <Button
                title={t(located ? 'plotDetail.editLocation' : 'plotDetail.setLocation')}
                onPress={startEditing}
                variant="outline"
                size="sm"
                testID="plot-detail-edit-location-btn"
              />
            </View>
          )}
        </Card>

        <Card variant="outlined" style={styles.card} testID="plot-detail-map-card">
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
            {t('plotMap.title')}
          </Text>
          {boundary || located ? (
            <PlotMap
              boundary={boundary}
              center={point}
              accessibilityLabel={t(boundary ? 'plotMap.previewLabel' : 'plotMap.pointLabel')}
              style={styles.mapPreview}
              testID="plot-detail-map"
            >
              {locatedScans.length > 0 && <HotspotLayer scans={hotspots} />}
            </PlotMap>
          ) : (
            <Text style={[muted, styles.line]} testID="plot-detail-no-boundary">
              {t('plotMap.noBoundary')}
            </Text>
          )}
          {locatedScans.length > 0 && (boundary || located) && (
            <HotspotControls
              scans={locatedScans}
              visible={hotspots}
              filters={hotspotFilters}
              onChange={setHotspotFilters}
              testID="plot-detail-hotspots"
            />
          )}
          {onOpenMap && (
            <View style={styles.buttons}>
              <Button
                title={t(boundary ? 'plotMap.edit' : 'plotMap.draw')}
                onPress={onOpenMap}
                variant="outline"
                size="sm"
                testID="plot-detail-open-map-btn"
              />
            </View>
          )}
        </Card>

        <WeatherRiskCard plot={plot} />

        <NdviCard plot={plot} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  card: {
    padding: 20,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  farmName: {
    marginLeft: 8,
  },
  line: {
    marginTop: 8,
  },
  fields: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  field: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    marginTop: 12,
  },
  buttonGap: {
    width: 8,
  },
  mapPreview: {
    height: 200,
    marginTop: 12,
  },
});

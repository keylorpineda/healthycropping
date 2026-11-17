import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlotMap } from '@/components/map';
import { Button, EmptyState } from '@/components/ui';
import {
  type BoundaryError,
  type BoundaryPoint,
  boundaryAreaHa,
  boundaryCenter,
  parseBoundaryGeoJson,
  plotsRepository,
  validateBoundary,
} from '@/db';
import { useTheme } from '@/theme';

export interface PlotMapScreenProps {
  plotId: string;
  /** Called after saving or cancelling. */
  onDone?: () => void;
  testID?: string;
}

/** Draws a plot boundary on OpenStreetMap: every tap adds a vertex (#41). */
export function PlotMapScreen({
  plotId,
  onDone,
  testID = 'plot-map-screen',
}: PlotMapScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [plot] = useState(() => plotsRepository.getById(plotId));
  const [points, setPoints] = useState<BoundaryPoint[]>(
    () => parseBoundaryGeoJson(plot?.boundary_geojson) ?? [],
  );
  const [error, setError] = useState<BoundaryError | null>(null);

  const header = (
    <View style={styles.header}>
      {onDone && (
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.backButton}
          testID="plot-map-back-btn"
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
      <Text style={[theme.typography.title2, styles.title, { color: theme.colors.textPrimary }]}>
        {plot?.name ?? t('plotMap.title')}
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
          testID="plot-map-not-found"
        />
      </SafeAreaView>
    );
  }

  const center =
    plot.latitude !== null && plot.longitude !== null
      ? { latitude: plot.latitude, longitude: plot.longitude }
      : null;

  const addPoint = (point: BoundaryPoint) => {
    setPoints((current) => [...current, point]);
    setError(null);
  };

  const save = () => {
    const problem = validateBoundary(points);
    if (problem) {
      setError(problem);
      return;
    }
    // A boundary also gives the plot a weather point when it had none (#79).
    const middle = center ? null : boundaryCenter(points);
    plotsRepository.update(plot.id, {
      boundary: points,
      ...(middle ? { latitude: middle.latitude, longitude: middle.longitude } : {}),
    });
    onDone?.();
  };

  const removeBoundary = () => {
    plotsRepository.update(plot.id, { boundary: null });
    onDone?.();
  };

  const area = points.length >= 3 ? boundaryAreaHa(points) : null;
  const hint = error
    ? t(`plotMap.errors.${error}`)
    : area !== null
      ? t('plotMap.area', { area: area.toFixed(2) })
      : t('plotMap.hint');

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {header}
      <PlotMap
        boundary={points}
        center={center}
        onPressPoint={addPoint}
        accessibilityLabel={t('plotMap.mapLabel', { count: points.length })}
        style={styles.map}
      />
      <View style={styles.footer}>
        <Text
          style={[
            theme.typography.subhead,
            { color: error ? theme.colors.status.actNow.main : theme.colors.textSecondary },
          ]}
          accessibilityLiveRegion="polite"
          testID="plot-map-hint"
        >
          {hint}
        </Text>
        <Text
          style={[theme.typography.caption, styles.count, { color: theme.colors.textTertiary }]}
          testID="plot-map-count"
        >
          {t('plotMap.points', { count: points.length })}
        </Text>
        <View style={styles.buttons}>
          <Button
            title={t('plotMap.undo')}
            onPress={() => {
              setPoints((current) => current.slice(0, -1));
              setError(null);
            }}
            variant="outline"
            size="sm"
            disabled={points.length === 0}
            testID="plot-map-undo-btn"
          />
          <View style={styles.gap} />
          <Button
            title={t('plotMap.clear')}
            onPress={() => {
              setPoints([]);
              setError(null);
            }}
            variant="outline"
            size="sm"
            disabled={points.length === 0}
            testID="plot-map-clear-btn"
          />
          <View style={styles.gap} />
          <Button
            title={t('farms.save')}
            onPress={save}
            variant="primary"
            size="sm"
            testID="plot-map-save-btn"
          />
        </View>
        {plot.boundary_geojson !== null && (
          <View style={styles.buttons}>
            <Button
              title={t('plotMap.remove')}
              onPress={removeBoundary}
              variant="ghost"
              size="sm"
              testID="plot-map-remove-btn"
            />
          </View>
        )}
      </View>
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
  map: {
    flex: 1,
    marginHorizontal: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  count: {
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    marginTop: 12,
  },
  gap: {
    width: 8,
  },
});

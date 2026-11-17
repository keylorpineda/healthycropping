import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/ui';
import { useTheme } from '@/theme';
import { type SupportedCrop } from '@/version';

import {
  countBySeverity,
  distinctValues,
  HOTSPOT_RANGES,
  type HotspotFilters,
  type LocatedScan,
} from './hotspots';

export interface HotspotControlsProps {
  /** Every mappable scan of the plot, before filtering (drives the chip options). */
  scans: readonly LocatedScan[];
  /** Scans left after filtering (drives the legend counts). */
  visible: readonly LocatedScan[];
  filters: HotspotFilters;
  onChange: (filters: HotspotFilters) => void;
  testID?: string;
}

/** Filter chips (crop, disease, date range) and a status legend with counts for the map. */
export function HotspotControls({
  scans,
  visible,
  filters,
  onChange,
  testID = 'hotspot-controls',
}: HotspotControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const crops = distinctValues(scans, 'crop');
  const classes = scans
    .filter((scan) => filters.crop === null || scan.crop === filters.crop)
    .reduce<{ crop: SupportedCrop; predictedClass: string }[]>((acc, scan) => {
      if (!acc.some((entry) => entry.predictedClass === scan.predicted_class)) {
        acc.push({ crop: scan.crop, predictedClass: scan.predicted_class });
      }
      return acc;
    }, []);
  const counts = countBySeverity(visible);

  const legend: { key: keyof typeof counts; color: string }[] = [
    { key: 'actNow', color: theme.colors.status.actNow.main },
    { key: 'watch', color: theme.colors.status.watch.main },
    { key: 'healthy', color: theme.colors.status.healthy.main },
  ];

  return (
    <View testID={testID}>
      <View style={styles.legend} testID={`${testID}-legend`}>
        {legend.map((entry) => (
          <View key={entry.key} style={styles.legendItem}>
            <View
              style={[styles.dot, { backgroundColor: entry.color }]}
              importantForAccessibility="no"
              accessible={false}
            />
            <Text
              style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
              testID={`${testID}-count-${entry.key}`}
            >
              {`${t(`status.${entry.key}`)}: ${counts[entry.key]}`}
            </Text>
          </View>
        ))}
      </View>

      {crops.length > 1 && (
        <View style={styles.chips} testID={`${testID}-crops`}>
          <Chip
            label={t('hotspots.allCrops')}
            selected={filters.crop === null}
            onPress={() => onChange({ ...filters, crop: null, predictedClass: null })}
            testID={`${testID}-crop-all`}
          />
          {crops.map((crop) => (
            <Chip
              key={crop}
              label={t(`crops.${crop}`)}
              selected={filters.crop === crop}
              onPress={() => onChange({ ...filters, crop, predictedClass: null })}
              testID={`${testID}-crop-${crop}`}
            />
          ))}
        </View>
      )}

      {classes.length > 1 && (
        <View style={styles.chips} testID={`${testID}-classes`}>
          <Chip
            label={t('hotspots.allDiseases')}
            selected={filters.predictedClass === null}
            onPress={() => onChange({ ...filters, predictedClass: null })}
            testID={`${testID}-class-all`}
          />
          {classes.map((entry) => (
            <Chip
              key={entry.predictedClass}
              label={t(`diseases.${entry.crop}.${entry.predictedClass}`)}
              selected={filters.predictedClass === entry.predictedClass}
              onPress={() => onChange({ ...filters, predictedClass: entry.predictedClass })}
              testID={`${testID}-class-${entry.predictedClass}`}
            />
          ))}
        </View>
      )}

      <View style={styles.chips} testID={`${testID}-ranges`}>
        {HOTSPOT_RANGES.map((range) => (
          <Chip
            key={range}
            label={t(`hotspots.ranges.${range}`)}
            selected={filters.range === range}
            onPress={() => onChange({ ...filters, range })}
            testID={`${testID}-range-${range}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
});

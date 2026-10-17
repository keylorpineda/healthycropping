import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip, ProgressMeter, Sheet } from '@/components/ui';
import {
  farmsRepository,
  plotsRepository,
  scansRepository,
  type Farm,
  type Plot,
  type Scan,
} from '@/db';
import { useTheme } from '@/theme';

export interface ScanDetailScreenProps {
  scanId: string;
  onBack?: () => void;
  onDelete?: () => void;
  testID?: string;
}

export function ScanDetailScreen({
  scanId,
  onBack,
  onDelete,
  testID = 'scan-detail-screen',
}: ScanDetailScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [scan, setScan] = useState<Scan | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [plot, setPlot] = useState<Plot | null>(null);

  // Location Assignment Sheet state
  const [isAssignSheetVisible, setIsAssignSheetVisible] = useState<boolean>(false);
  const [allFarms, setAllFarms] = useState<Farm[]>([]);
  const [availablePlots, setAvailablePlots] = useState<Plot[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);

  const loadScanData = () => {
    const loadedScan = scansRepository.getById(scanId);
    setScan(loadedScan);

    if (loadedScan?.farm_id) {
      setFarm(farmsRepository.getById(loadedScan.farm_id));
    } else {
      setFarm(null);
    }

    if (loadedScan?.plot_id) {
      setPlot(plotsRepository.getById(loadedScan.plot_id));
    } else {
      setPlot(null);
    }
  };

  useEffect(() => {
    loadScanData();
  }, [scanId]);

  const handleOpenAssignSheet = () => {
    const loadedFarms = farmsRepository.getAll();
    setAllFarms(loadedFarms);

    const initialFarmId = scan?.farm_id ?? loadedFarms[0]?.id ?? null;
    setSelectedFarmId(initialFarmId);

    if (initialFarmId) {
      setAvailablePlots(plotsRepository.getByFarm(initialFarmId));
    } else {
      setAvailablePlots([]);
    }

    setSelectedPlotId(scan?.plot_id ?? null);
    setIsAssignSheetVisible(true);
  };

  const handleSelectFarm = (farmId: string) => {
    setSelectedFarmId(farmId);
    const plots = plotsRepository.getByFarm(farmId);
    setAvailablePlots(plots);
    setSelectedPlotId(null);
  };

  const handleSaveLocation = () => {
    if (scan) {
      scansRepository.updateLocation(scan.id, selectedFarmId, selectedPlotId);
      setIsAssignSheetVisible(false);
      loadScanData();
    }
  };

  const handleDelete = () => {
    if (scan) {
      scansRepository.delete(scan.id);
      onDelete?.();
      onBack?.();
    }
  };

  if (!scan) {
    return (
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.colors.background }]}
        testID={testID}
      >
        <View style={styles.header}>
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={styles.backButton}
              testID="scan-detail-back-btn"
            >
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>←</Text>
            </Pressable>
          )}
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
            {t('scanDetail.title')}
          </Text>
        </View>
        <View style={styles.notFound}>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            {t('history.noScansTitle')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const diseaseKey = `diseases.${scan.crop}.${scan.predicted_class}`;
  const translatedName = t(diseaseKey);
  const displayTitle = translatedName !== diseaseKey ? translatedName : scan.predicted_class;

  let statusLabel = t('result.statusWatch');
  if (scan.severity === 'healthy') statusLabel = t('result.statusHealthy');
  if (scan.severity === 'actNow') statusLabel = t('result.statusActNow');

  let adviceText = t('result.adviceWatch');
  if (scan.severity === 'healthy') adviceText = t('result.adviceHealthy');
  if (scan.severity === 'actNow') adviceText = t('result.adviceActNow');

  let probabilities: Record<string, number> = {};
  if (scan.explanation_json) {
    try {
      const parsed = JSON.parse(scan.explanation_json);
      if (parsed.probabilities) {
        probabilities = parsed.probabilities;
      }
    } catch {
      // Ignored
    }
  }

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {/* Assign Farm & Plot Sheet */}
      <Sheet
        visible={isAssignSheetVisible}
        onClose={() => setIsAssignSheetVisible(false)}
        title={t('scanDetail.assignFarm')}
        testID="assign-location-sheet"
      >
        <View style={styles.sheetContent}>
          {allFarms.length === 0 ? (
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.textSecondary, marginBottom: 16 },
              ]}
            >
              {t('farms.noFarms')}
            </Text>
          ) : (
            <>
              <Text
                style={[
                  theme.typography.headline,
                  { color: theme.colors.textPrimary, marginBottom: 8 },
                ]}
              >
                {t('scanDetail.farm')}
              </Text>
              <View style={styles.chipRow}>
                {allFarms.map((f) => (
                  <View key={f.id} style={{ marginRight: 8, marginBottom: 8 }}>
                    <Chip
                      label={f.name}
                      selected={selectedFarmId === f.id}
                      onPress={() => handleSelectFarm(f.id)}
                      testID={`select-farm-${f.id}`}
                    />
                  </View>
                ))}
              </View>

              {availablePlots.length > 0 && (
                <>
                  <Text
                    style={[
                      theme.typography.headline,
                      { color: theme.colors.textPrimary, marginTop: 12, marginBottom: 8 },
                    ]}
                  >
                    {t('scanDetail.plot')}
                  </Text>
                  <View style={styles.chipRow}>
                    {availablePlots.map((p) => (
                      <View key={p.id} style={{ marginRight: 8, marginBottom: 8 }}>
                        <Chip
                          label={p.name}
                          crop={p.crop}
                          selected={selectedPlotId === p.id}
                          onPress={() => setSelectedPlotId(p.id)}
                          testID={`select-plot-${p.id}`}
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          <View style={{ marginTop: 20 }}>
            <Button
              title={t('common.confirm')}
              onPress={handleSaveLocation}
              variant="primary"
              size="lg"
              fullWidth
              testID="confirm-location-btn"
            />
          </View>
        </View>
      </Sheet>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={styles.backButton}
              testID="scan-detail-back-btn"
            >
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>←</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
              testID="scan-detail-title"
            >
              {t('scanDetail.title')}
            </Text>
          </View>
          <Badge
            label={
              scan.sync_status === 'synced' ? t('history.syncSynced') : t('history.syncPending')
            }
            variant={scan.sync_status === 'synced' ? 'healthy' : 'neutral'}
            size="sm"
            testID="scan-sync-badge"
          />
        </View>

        {/* Hero Photo Card */}
        <View style={[styles.heroCard, theme.elevation.md]}>
          <Image
            source={{ uri: scan.local_photo_uri }}
            style={styles.heroImage}
            resizeMode="cover"
            testID="scan-detail-hero-image"
          />
        </View>

        {/* Diagnosis Card */}
        <Card
          variant="elevated"
          style={[
            styles.card,
            {
              borderLeftWidth: 5,
              borderLeftColor:
                scan.severity === 'healthy'
                  ? theme.colors.status.healthy.main
                  : scan.severity === 'actNow'
                    ? theme.colors.status.actNow.main
                    : theme.colors.status.watch.main,
            },
          ]}
          testID="scan-detail-diagnosis-card"
        >
          <View style={styles.cardHeaderBadges}>
            <Badge label={t(`crops.${scan.crop}`)} variant={scan.crop} size="sm" />
            <View style={{ width: 8 }} />
            <Badge label={statusLabel} variant={scan.severity} size="sm" />
          </View>

          <Text
            style={[
              theme.typography.title1,
              { color: theme.colors.textPrimary, marginTop: 8, marginBottom: 16 },
            ]}
            testID="scan-detail-disease-name"
          >
            {displayTitle}
          </Text>

          {/* Confidence Progress Meter */}
          <View style={{ marginBottom: 16 }}>
            <ProgressMeter
              value={scan.confidence}
              label={t('result.confidence')}
              severityVariant={scan.severity}
              size="md"
              testID="scan-detail-progress-meter"
            />
          </View>

          {/* Recommended Next Steps */}
          <View
            style={[
              styles.adviceBox,
              {
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.headline,
                { color: theme.colors.textPrimary, marginBottom: 6 },
              ]}
            >
              {t('result.nextSteps')}
            </Text>
            <Text
              style={[
                theme.typography.subhead,
                { color: theme.colors.textSecondary, lineHeight: 20 },
              ]}
              testID="scan-detail-advice-text"
            >
              {adviceText}
            </Text>
          </View>

          {/* Probabilities Breakdown if present */}
          {Object.keys(probabilities).length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={[
                  theme.typography.bodyBold,
                  { color: theme.colors.textPrimary, marginBottom: 8 },
                ]}
              >
                {t('result.probabilities')}
              </Text>
              {Object.entries(probabilities).map(([key, prob]) => (
                <View key={key} style={styles.probRow}>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                    {t(`diseases.${scan.crop}.${key}`)}
                  </Text>
                  <Text
                    style={[
                      theme.typography.caption,
                      {
                        color:
                          key === scan.predicted_class
                            ? theme.colors.primary
                            : theme.colors.textTertiary,
                        fontWeight: key === scan.predicted_class ? '700' : '400',
                      },
                    ]}
                  >
                    {`${Math.round(prob * 100)}%`}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Location Assignment Card */}
        <Card variant="outlined" style={styles.card} testID="scan-detail-location-card">
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: 8 },
            ]}
          >
            {t('scanDetail.location')}
          </Text>

          <View style={styles.locationInfoRow}>
            <Text
              style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}
              testID="scan-detail-location-text"
            >
              {farm
                ? `${farm.name}${plot ? ` • ${plot.name}` : ''}`
                : t('scanDetail.noFarmAssigned')}
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <Button
              title={t('scanDetail.assignFarm')}
              onPress={handleOpenAssignSheet}
              variant="outline"
              size="md"
              testID="scan-detail-assign-btn"
            />
          </View>
        </Card>

        {/* Metadata Card */}
        <Card variant="outlined" style={styles.card}>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: 8 },
            ]}
          >
            {t('scanDetail.modelInfo')}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            {`${t('scanDetail.modelInfo')}: ${scan.model_version}`}
          </Text>
          <Text
            style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: 4 }]}
          >
            {`${t('scanDetail.scannedAt')}: ${new Date(scan.scanned_at).toLocaleString()}`}
          </Text>
        </Card>

        {/* Delete Scan Action */}
        <View style={{ marginTop: 8, marginBottom: 16 }}>
          <Button
            title={t('scanDetail.deleteScan')}
            onPress={handleDelete}
            variant="ghost"
            size="md"
            testID="scan-detail-delete-btn"
          />
        </View>

        {/* Agronomic Disclaimer */}
        <View
          style={[
            styles.disclaimerContainer,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
          testID="scan-detail-disclaimer-box"
        >
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textTertiary, textAlign: 'center', lineHeight: 18 },
            ]}
          >
            {t('common.disclaimer')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#000000',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adviceBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  probRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  locationInfoRow: {
    paddingVertical: 4,
  },
  sheetContent: {
    paddingVertical: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  disclaimerContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
});

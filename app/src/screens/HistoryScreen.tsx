import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Card, Chip, EmptyState, Toast } from '@/components/ui';
import {
  farmsRepository,
  type DiagnosisSeverity,
  type Farm,
  type Scan,
  scansRepository,
} from '@/db';
import { useTheme } from '@/theme';
import { type SupportedCrop } from '@/version';

export interface HistoryScreenProps {
  onBack?: () => void;
  onOpenScanDetail?: (scanId: string) => void;
  onScanNew?: (crop: SupportedCrop) => void;
  testID?: string;
}

export function HistoryScreen({
  onBack,
  onOpenScanDetail,
  onScanNew,
  testID = 'history-screen',
}: HistoryScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [scans, setScans] = useState<Scan[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters
  const [selectedCrop, setSelectedCrop] = useState<SupportedCrop | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<DiagnosisSeverity | 'all'>('all');
  const [selectedFarmId, setSelectedFarmId] = useState<string | 'all'>('all');

  // Undo Toast state
  const [deletedScanId, setDeletedScanId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState<boolean>(false);

  const loadData = useCallback(() => {
    const filters: {
      crop?: SupportedCrop;
      severity?: DiagnosisSeverity;
      farm_id?: string;
    } = {};

    if (selectedCrop !== 'all') filters.crop = selectedCrop;
    if (selectedSeverity !== 'all') filters.severity = selectedSeverity;
    if (selectedFarmId !== 'all') filters.farm_id = selectedFarmId;

    const loadedScans = scansRepository.getAll(filters);
    const loadedFarms = farmsRepository.getAll();

    setScans(loadedScans);
    setFarms(loadedFarms);
  }, [selectedCrop, selectedSeverity, selectedFarmId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  };

  const handleDeleteScan = (id: string) => {
    scansRepository.delete(id);
    setDeletedScanId(id);
    setToastVisible(true);
    loadData();
  };

  const handleUndoDelete = () => {
    if (deletedScanId) {
      scansRepository.restore(deletedScanId);
      setDeletedScanId(null);
      setToastVisible(false);
      loadData();
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const renderScanItem = ({ item }: { item: Scan }) => {
    const diseaseKey = `diseases.${item.crop}.${item.predicted_class}`;
    const translatedName = t(diseaseKey);
    const displayTitle = translatedName !== diseaseKey ? translatedName : item.predicted_class;

    let statusLabel = t('result.statusWatch');
    if (item.severity === 'healthy') statusLabel = t('result.statusHealthy');
    if (item.severity === 'actNow') statusLabel = t('result.statusActNow');

    return (
      <Card
        variant="elevated"
        style={[styles.scanCard, { borderColor: theme.colors.borderSubtle }]}
        testID={`scan-item-card-${item.id}`}
      >
        <Pressable
          onPress={() => onOpenScanDetail?.(item.id)}
          style={styles.cardPressable}
          accessibilityRole="button"
          accessibilityLabel={`${displayTitle}, ${t(`crops.${item.crop}`)}`}
          testID={`scan-item-${item.id}`}
        >
          {/* Photo Thumbnail */}
          <View style={styles.thumbnailContainer}>
            <Image
              source={{ uri: item.local_photo_uri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          </View>

          {/* Details Column */}
          <View style={styles.cardDetails}>
            <View style={styles.cardHeaderRow}>
              <Badge label={t(`crops.${item.crop}`)} variant={item.crop} size="sm" />
              <View style={{ width: 6 }} />
              <Badge label={statusLabel} variant={item.severity} size="sm" />
            </View>

            <Text
              style={[
                theme.typography.headline,
                { color: theme.colors.textPrimary, marginTop: 4, marginBottom: 4 },
              ]}
              numberOfLines={1}
            >
              {displayTitle}
            </Text>

            <View style={styles.cardMetaRow}>
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                {formatDate(item.scanned_at)}
              </Text>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.primary, fontWeight: '700', marginLeft: 8 },
                ]}
              >
                {`${Math.round(item.confidence * 100)}%`}
              </Text>
            </View>
          </View>

          {/* Delete Action Button */}
          <Pressable
            onPress={() => handleDeleteScan(item.id)}
            style={styles.deleteButton}
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete')} ${displayTitle}`}
            testID={`delete-scan-btn-${item.id}`}
          >
            <Text style={{ fontSize: 18, color: theme.colors.textTertiary }}>🗑️</Text>
          </Pressable>
        </Pressable>
      </Card>
    );
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {/* Undo Toast */}
      <Toast
        visible={toastVisible}
        message={t('history.deletedToast')}
        variant="info"
        durationMs={4000}
        action={{
          label: t('history.undo'),
          onPress: handleUndoDelete,
        }}
        onDismiss={() => setToastVisible(false)}
        testID="history-undo-toast"
      />

      {/* Screen Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backButton}
            testID="history-back-btn"
          >
            <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>←</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
            testID="history-title"
          >
            {t('history.title')}
          </Text>
        </View>
        <Badge label={`${scans.length}`} variant="neutral" size="md" testID="history-count-badge" />
      </View>

      {/* Filter Section */}
      <View style={styles.filterSection}>
        {/* Crop Filter Chips */}
        <View style={styles.filterRow}>
          <Chip
            label={t('history.filterAll')}
            selected={selectedCrop === 'all'}
            onPress={() => setSelectedCrop('all')}
            testID="filter-crop-all"
          />
          <View style={{ width: 8 }} />
          <Chip
            label={t('crops.coffee')}
            crop="coffee"
            selected={selectedCrop === 'coffee'}
            onPress={() => setSelectedCrop('coffee')}
            testID="filter-crop-coffee"
          />
          <View style={{ width: 8 }} />
          <Chip
            label={t('crops.cacao')}
            crop="cacao"
            selected={selectedCrop === 'cacao'}
            onPress={() => setSelectedCrop('cacao')}
            testID="filter-crop-cacao"
          />
          <View style={{ width: 8 }} />
          <Chip
            label={t('crops.banana')}
            crop="banana"
            selected={selectedCrop === 'banana'}
            onPress={() => setSelectedCrop('banana')}
            testID="filter-crop-banana"
          />
        </View>

        {/* Severity Filter Chips */}
        <View style={[styles.filterRow, { marginTop: 8 }]}>
          <Chip
            label={t('history.filterAll')}
            selected={selectedSeverity === 'all'}
            onPress={() => setSelectedSeverity('all')}
            testID="filter-severity-all"
          />
          <View style={{ width: 8 }} />
          <Chip
            label={t('status.healthy')}
            selected={selectedSeverity === 'healthy'}
            onPress={() => setSelectedSeverity('healthy')}
            testID="filter-severity-healthy"
          />
          <View style={{ width: 8 }} />
          <Chip
            label={t('status.watch')}
            selected={selectedSeverity === 'watch'}
            onPress={() => setSelectedSeverity('watch')}
            testID="filter-severity-watch"
          />
          <View style={{ width: 8 }} />
          <Chip
            label={t('status.actNow')}
            selected={selectedSeverity === 'actNow'}
            onPress={() => setSelectedSeverity('actNow')}
            testID="filter-severity-actNow"
          />
        </View>

        {/* Farm Filter Chips if farms exist */}
        {farms.length > 0 && (
          <View style={[styles.filterRow, { marginTop: 8 }]}>
            <Chip
              label={t('history.allFarms')}
              selected={selectedFarmId === 'all'}
              onPress={() => setSelectedFarmId('all')}
              testID="filter-farm-all"
            />
            {farms.map((f) => (
              <React.Fragment key={f.id}>
                <View style={{ width: 8 }} />
                <Chip
                  label={f.name}
                  selected={selectedFarmId === f.id}
                  onPress={() => setSelectedFarmId(f.id)}
                  testID={`filter-farm-${f.id}`}
                />
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {/* Scans List / Empty State */}
      <FlatList
        data={scans}
        keyExtractor={(item) => item.id}
        renderItem={renderScanItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <Card variant="outlined" style={styles.emptyContainer}>
            <EmptyState
              title={t('history.noScansTitle')}
              description={t('history.noScansDescription')}
              actionLabel={t('home.scanAction')}
              onAction={() => onScanNew?.(selectedCrop !== 'all' ? selectedCrop : 'coffee')}
              testID="history-empty-state"
            />
          </Card>
        }
      />
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
  filterSection: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  scanCard: {
    marginBottom: 12,
    padding: 12,
  },
  cardPressable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnailContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    marginRight: 12,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  cardDetails: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyContainer: {
    marginTop: 24,
    padding: 16,
    alignItems: 'center',
  },
});

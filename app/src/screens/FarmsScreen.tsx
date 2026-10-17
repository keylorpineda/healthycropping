import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip, EmptyState, Sheet } from '@/components/ui';
import { farmsRepository, plotsRepository, type Farm, type Plot } from '@/db';
import { useTheme } from '@/theme';
import { type SupportedCrop } from '@/version';

export interface FarmsScreenProps {
  onBack?: () => void;
  testID?: string;
}

export function FarmsScreen({
  onBack,
  testID = 'farms-screen',
}: FarmsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [plotsByFarm, setPlotsByFarm] = useState<Record<string, Plot[]>>({});

  // Add Farm Sheet
  const [isAddFarmVisible, setIsAddFarmVisible] = useState<boolean>(false);
  const [newFarmName, setNewFarmName] = useState<string>('');
  const [newFarmRegion, setNewFarmRegion] = useState<string>('');
  const [newFarmAltitude, setNewFarmAltitude] = useState<string>('');

  // Add Plot Sheet
  const [isAddPlotVisible, setIsAddPlotVisible] = useState<boolean>(false);
  const [activeFarmForPlot, setActiveFarmForPlot] = useState<Farm | null>(null);
  const [newPlotName, setNewPlotName] = useState<string>('');
  const [newPlotCrop, setNewPlotCrop] = useState<SupportedCrop>('coffee');
  const [newPlotArea, setNewPlotArea] = useState<string>('');

  const loadFarmsAndPlots = () => {
    const loadedFarms = farmsRepository.getAll();
    setFarms(loadedFarms);

    const plotsMap: Record<string, Plot[]> = {};
    for (const f of loadedFarms) {
      plotsMap[f.id] = plotsRepository.getByFarm(f.id);
    }
    setPlotsByFarm(plotsMap);
  };

  useEffect(() => {
    loadFarmsAndPlots();
  }, []);

  const handleCreateFarm = () => {
    if (!newFarmName.trim() || !newFarmRegion.trim()) return;

    const altitude = newFarmAltitude ? parseFloat(newFarmAltitude) : null;
    farmsRepository.create({
      name: newFarmName,
      region: newFarmRegion,
      altitude_m: isNaN(altitude ?? NaN) ? null : altitude,
    });

    setNewFarmName('');
    setNewFarmRegion('');
    setNewFarmAltitude('');
    setIsAddFarmVisible(false);
    loadFarmsAndPlots();
  };

  const handleDeleteFarm = (id: string, name: string) => {
    Alert.alert(t('farms.deleteFarm'), `${t('common.confirm')} ${name}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          farmsRepository.delete(id);
          loadFarmsAndPlots();
        },
      },
    ]);
  };

  const handleOpenAddPlot = (farm: Farm) => {
    setActiveFarmForPlot(farm);
    setNewPlotName('');
    setNewPlotCrop('coffee');
    setNewPlotArea('');
    setIsAddPlotVisible(true);
  };

  const handleCreatePlot = () => {
    if (!activeFarmForPlot || !newPlotName.trim()) return;

    const area = newPlotArea ? parseFloat(newPlotArea) : null;
    plotsRepository.create({
      farm_id: activeFarmForPlot.id,
      name: newPlotName,
      crop: newPlotCrop,
      area_ha: isNaN(area ?? NaN) ? null : area,
    });

    setIsAddPlotVisible(false);
    setActiveFarmForPlot(null);
    loadFarmsAndPlots();
  };

  const handleDeletePlot = (plotId: string) => {
    plotsRepository.delete(plotId);
    loadFarmsAndPlots();
  };

  const renderFarmItem = ({ item }: { item: Farm }) => {
    const plots = plotsByFarm[item.id] || [];

    return (
      <Card
        variant="elevated"
        style={[styles.farmCard, { borderColor: theme.colors.borderSubtle }]}
        testID={`farm-card-${item.id}`}
      >
        <View style={styles.farmHeader}>
          <View style={{ flex: 1 }}>
            <Text
              style={[theme.typography.title3, { color: theme.colors.textPrimary }]}
              testID={`farm-name-${item.id}`}
            >
              {item.name}
            </Text>
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.textSecondary, marginTop: 2 },
              ]}
            >
              {`${item.region}${item.altitude_m ? ` • ${item.altitude_m} m s.n.m.` : ''}`}
            </Text>
          </View>

          <Pressable
            onPress={() => handleDeleteFarm(item.id, item.name)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete')} ${item.name}`}
            testID={`delete-farm-${item.id}`}
          >
            <Text style={{ fontSize: 16, color: theme.colors.textTertiary }}>🗑️</Text>
          </Pressable>
        </View>

        {/* Plots List */}
        <View style={styles.plotsSection}>
          <View style={styles.plotsSectionHeader}>
            <Text
              style={[
                theme.typography.subhead,
                { color: theme.colors.textSecondary, fontWeight: '600' },
              ]}
            >
              {`${plots.length} ${t('farms.plotsCount')}`}
            </Text>
            <Button
              title={`+ ${t('farms.addPlot')}`}
              onPress={() => handleOpenAddPlot(item)}
              variant="outline"
              size="sm"
              testID={`add-plot-btn-${item.id}`}
            />
          </View>

          {plots.map((p) => (
            <View
              key={p.id}
              style={[styles.plotRow, { borderBottomColor: theme.colors.borderSubtle }]}
              testID={`plot-row-${p.id}`}
            >
              <View style={styles.plotInfoCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Badge label={t(`crops.${p.crop}`)} variant={p.crop} size="sm" />
                  <Text
                    style={[
                      theme.typography.bodyBold,
                      { color: theme.colors.textPrimary, marginLeft: 8 },
                    ]}
                    testID={`plot-name-${p.id}`}
                  >
                    {p.name}
                  </Text>
                </View>
                {p.area_ha !== null && (
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.textTertiary, marginTop: 2 },
                    ]}
                    testID={`plot-area-${p.id}`}
                  >
                    {`${p.area_ha} ha`}
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => handleDeletePlot(p.id)}
                style={styles.smallDeleteBtn}
                accessibilityRole="button"
                accessibilityLabel={`${t('common.delete')} ${p.name}`}
                testID={`delete-plot-${p.id}`}
              >
                <Text style={{ fontSize: 14, color: theme.colors.textTertiary }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {/* Add Farm Sheet */}
      <Sheet
        visible={isAddFarmVisible}
        onClose={() => setIsAddFarmVisible(false)}
        title={t('farms.addFarm')}
        testID="add-farm-sheet"
      >
        <View style={styles.sheetForm}>
          <Text
            style={[
              theme.typography.caption,
              { fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4 },
            ]}
          >
            {t('farms.farmName')}
          </Text>
          <TextInput
            value={newFarmName}
            onChangeText={setNewFarmName}
            placeholder="e.g. Finca El Cafetal"
            placeholderTextColor={theme.colors.textTertiary}
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            testID="new-farm-name-input"
          />

          <Text
            style={[
              theme.typography.caption,
              {
                fontWeight: '700',
                color: theme.colors.textSecondary,
                marginTop: 12,
                marginBottom: 4,
              },
            ]}
          >
            {t('farms.region')}
          </Text>
          <TextInput
            value={newFarmRegion}
            onChangeText={setNewFarmRegion}
            placeholder="e.g. Tarrazú, San José"
            placeholderTextColor={theme.colors.textTertiary}
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            testID="new-farm-region-input"
          />

          <Text
            style={[
              theme.typography.caption,
              {
                fontWeight: '700',
                color: theme.colors.textSecondary,
                marginTop: 12,
                marginBottom: 4,
              },
            ]}
          >
            {t('farms.altitude')}
          </Text>
          <TextInput
            value={newFarmAltitude}
            onChangeText={setNewFarmAltitude}
            placeholder="e.g. 1500"
            keyboardType="numeric"
            placeholderTextColor={theme.colors.textTertiary}
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            testID="new-farm-altitude-input"
          />

          <View style={{ marginTop: 20 }}>
            <Button
              title={t('farms.save')}
              onPress={handleCreateFarm}
              variant="primary"
              size="lg"
              fullWidth
              testID="submit-new-farm-btn"
            />
          </View>
        </View>
      </Sheet>

      {/* Add Plot Sheet */}
      <Sheet
        visible={isAddPlotVisible}
        onClose={() => setIsAddPlotVisible(false)}
        title={`${t('farms.addPlot')} (${activeFarmForPlot?.name ?? ''})`}
        testID="add-plot-sheet"
      >
        <View style={styles.sheetForm}>
          <Text
            style={[
              theme.typography.caption,
              { fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4 },
            ]}
          >
            {t('farms.plotName')}
          </Text>
          <TextInput
            value={newPlotName}
            onChangeText={setNewPlotName}
            placeholder="e.g. Lote Las Nubes"
            placeholderTextColor={theme.colors.textTertiary}
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            testID="new-plot-name-input"
          />

          <Text
            style={[
              theme.typography.caption,
              {
                fontWeight: '700',
                color: theme.colors.textSecondary,
                marginTop: 12,
                marginBottom: 8,
              },
            ]}
          >
            {t('farms.selectCrop')}
          </Text>
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <Chip
              label={t('crops.coffee')}
              crop="coffee"
              selected={newPlotCrop === 'coffee'}
              onPress={() => setNewPlotCrop('coffee')}
              testID="plot-crop-coffee"
            />
            <View style={{ width: 8 }} />
            <Chip
              label={t('crops.cacao')}
              crop="cacao"
              selected={newPlotCrop === 'cacao'}
              onPress={() => setNewPlotCrop('cacao')}
              testID="plot-crop-cacao"
            />
            <View style={{ width: 8 }} />
            <Chip
              label={t('crops.banana')}
              crop="banana"
              selected={newPlotCrop === 'banana'}
              onPress={() => setNewPlotCrop('banana')}
              testID="plot-crop-banana"
            />
          </View>

          <Text
            style={[
              theme.typography.caption,
              { fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4 },
            ]}
          >
            {t('farms.areaHa')}
          </Text>
          <TextInput
            value={newPlotArea}
            onChangeText={setNewPlotArea}
            placeholder="e.g. 2.5"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textTertiary}
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            testID="new-plot-area-input"
          />

          <View style={{ marginTop: 20 }}>
            <Button
              title={t('farms.save')}
              onPress={handleCreatePlot}
              variant="primary"
              size="lg"
              fullWidth
              testID="submit-new-plot-btn"
            />
          </View>
        </View>
      </Sheet>

      {/* Screen Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backButton}
            testID="farms-back-btn"
          >
            <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>←</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
            testID="farms-title"
          >
            {t('farms.title')}
          </Text>
        </View>

        <Button
          title={`+ ${t('farms.addFarm')}`}
          onPress={() => setIsAddFarmVisible(true)}
          variant="primary"
          size="sm"
          testID="header-add-farm-btn"
        />
      </View>

      {/* Farms List / Empty State */}
      <FlatList
        data={farms}
        keyExtractor={(item) => item.id}
        renderItem={renderFarmItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Card variant="outlined" style={styles.emptyContainer}>
            <EmptyState
              title={t('farms.noFarms')}
              description={t('farms.noFarmsDescription')}
              actionLabel={`+ ${t('farms.addFarm')}`}
              onAction={() => setIsAddFarmVisible(true)}
              testID="farms-empty-state"
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  farmCard: {
    marginBottom: 16,
    padding: 16,
  },
  farmHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  plotsSection: {
    marginTop: 4,
  },
  plotsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  plotInfoCol: {
    flex: 1,
  },
  smallDeleteBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetForm: {
    paddingVertical: 12,
  },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  emptyContainer: {
    marginTop: 24,
    padding: 16,
    alignItems: 'center',
  },
});

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip, EmptyState, Toast } from '@/components/ui';
import { type Scan, scansRepository } from '@/db';
import { isCropAvailable } from '@/ml/registry';
import { useTheme } from '@/theme';
import { SUPPORTED_CROPS, type SupportedCrop } from '@/version';

export interface HomeScreenProps {
  onOpenSettings?: () => void;
  onScan?: (crop: SupportedCrop) => void;
  onOpenHistory?: () => void;
  onOpenFarms?: () => void;
  onOpenScanDetail?: (scanId: string) => void;
  testID?: string;
}

export function HomeScreen({
  onOpenSettings,
  onScan,
  onOpenHistory,
  onOpenFarms,
  onOpenScanDetail,
  testID = 'home-screen',
}: HomeScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [selectedCrop, setSelectedCrop] = useState<SupportedCrop>('coffee');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [recentScans, setRecentScans] = useState<Scan[]>([]);

  useEffect(() => {
    try {
      const allScans = scansRepository.getAll();
      setRecentScans(allScans.slice(0, 3));
    } catch {
      // Ignored if db not initialized yet in specific test contexts
    }
  }, []);

  const handleScanPress = () => {
    if (onScan) {
      onScan(selectedCrop);
    } else {
      setToastMessage(`${t('common.analyzing')} (${t(`crops.${selectedCrop}`)})`);
      setToastVisible(true);
    }
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {/* Toast Overlay */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        variant="info"
        durationMs={3000}
        onDismiss={() => setToastVisible(false)}
        testID="home-toast"
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.brandingCol}>
            <Text
              style={[theme.typography.title1, { color: theme.colors.primary }]}
              testID="home-title"
            >
              {t('common.appName')}
            </Text>
            <Text
              style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}
              testID="home-tagline"
            >
              {t('common.tagline')}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Badge
              label={t('home.offlinePill')}
              variant="healthy"
              size="sm"
              testID="home-offline-badge"
            />
            {onOpenFarms && (
              <Pressable
                onPress={onOpenFarms}
                accessibilityRole="button"
                accessibilityLabel={t('farms.title')}
                style={styles.settingsButton}
                testID="home-farms-btn"
              >
                <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                  🏡
                </Text>
              </Pressable>
            )}
            {onOpenHistory && (
              <Pressable
                onPress={onOpenHistory}
                accessibilityRole="button"
                accessibilityLabel={t('history.title')}
                style={styles.settingsButton}
                testID="home-history-btn"
              >
                <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                  📋
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
              style={styles.settingsButton}
              testID="home-settings-btn"
            >
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>⚙️</Text>
            </Pressable>
          </View>
        </View>

        {/* Crop Selection Section */}
        <View style={styles.section}>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
            ]}
            testID="home-crop-selector-title"
          >
            {t('home.selectCrop')}
          </Text>
          <View style={styles.cropChipsRow} testID="crop-chips-row">
            {SUPPORTED_CROPS.map((crop, index) => {
              const available = isCropAvailable(crop);
              const label = available
                ? t(`crops.${crop}`)
                : `${t(`crops.${crop}`)} (${t('home.cropComingSoon')})`;
              return (
                <React.Fragment key={crop}>
                  {index > 0 && <View style={{ width: theme.spacing.sm }} />}
                  <Chip
                    label={label}
                    crop={crop}
                    selected={selectedCrop === crop}
                    disabled={!available}
                    onPress={() => setSelectedCrop(crop)}
                    testID={`crop-chip-${crop}`}
                  />
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Primary Scan CTA Card */}
        <Card
          variant="elevated"
          style={[styles.scanCard, { borderColor: theme.colors.borderSubtle }]}
          testID="home-scan-card"
        >
          <View style={styles.scanCardHeader}>
            <Text
              style={[
                theme.typography.title2,
                { color: theme.colors.textPrimary, marginBottom: 4 },
              ]}
            >
              {`${t('home.scanAction')} — ${t(`crops.${selectedCrop}`)}`}
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
              ]}
            >
              {t('home.scanHint')}
            </Text>
          </View>

          <Button
            title={t('home.scanAction')}
            onPress={handleScanPress}
            variant="primary"
            size="lg"
            fullWidth
            testID="home-scan-cta-btn"
          />
        </Card>

        {/* Recent Scans Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[theme.typography.headline, { color: theme.colors.textPrimary }]}
              testID="home-recent-scans-title"
            >
              {t('home.recentScans')}
            </Text>
            <Badge
              label={`${recentScans.length}`}
              variant="neutral"
              size="sm"
              testID="home-recent-scans-count"
            />
          </View>

          {recentScans.length === 0 ? (
            <Card variant="outlined" style={styles.emptyStateCard}>
              <EmptyState
                title={t('home.noScansTitle')}
                description={t('home.noScansDescription')}
                actionLabel={t('home.scanAction')}
                onAction={handleScanPress}
                testID="home-empty-state"
              />
            </Card>
          ) : (
            <View>
              {recentScans.map((scan) => {
                const diseaseKey = `diseases.${scan.crop}.${scan.predicted_class}`;
                const translated = t(diseaseKey);
                const title = translated !== diseaseKey ? translated : scan.predicted_class;
                return (
                  <Card
                    key={scan.id}
                    variant="elevated"
                    style={[styles.recentScanCard, { borderColor: theme.colors.borderSubtle }]}
                    testID={`home-scan-card-${scan.id}`}
                  >
                    <Pressable
                      onPress={() => onOpenScanDetail?.(scan.id)}
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                      accessibilityRole="button"
                      accessibilityLabel={title}
                    >
                      <View style={{ flex: 1 }}>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}
                        >
                          <Badge label={t(`crops.${scan.crop}`)} variant={scan.crop} size="sm" />
                          <View style={{ width: 6 }} />
                          <Badge
                            label={
                              scan.severity === 'healthy'
                                ? t('result.statusHealthy')
                                : scan.severity === 'actNow'
                                  ? t('result.statusActNow')
                                  : t('result.statusWatch')
                            }
                            variant={scan.severity}
                            size="sm"
                          />
                        </View>
                        <Text
                          style={[theme.typography.headline, { color: theme.colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {title}
                        </Text>
                      </View>
                      <Text style={[theme.typography.bodyBold, { color: theme.colors.primary }]}>
                        {`${Math.round(scan.confidence * 100)}%`}
                      </Text>
                    </Pressable>
                  </Card>
                );
              })}

              {onOpenHistory && (
                <View style={{ marginTop: 8 }}>
                  <Button
                    title={t('history.title')}
                    onPress={onOpenHistory}
                    variant="outline"
                    size="md"
                    fullWidth
                    testID="home-view-history-btn"
                  />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Non-Replacement Agronomic Disclaimer */}
        <View
          style={[
            styles.disclaimerContainer,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
          testID="home-disclaimer-box"
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandingCol: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cropChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanCard: {
    padding: 20,
    marginBottom: 24,
  },
  scanCardHeader: {
    alignItems: 'flex-start',
  },
  emptyStateCard: {
    padding: 12,
    alignItems: 'center',
  },
  disclaimerContainer: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  recentScanCard: {
    padding: 14,
    marginBottom: 8,
  },
});

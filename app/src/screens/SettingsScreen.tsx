import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip } from '@/components/ui';
import { type SupportedLanguage } from '@/i18n';
import { type ThemePreference, usePreferencesStore } from '@/stores/preferences';
import { useTheme } from '@/theme';

export interface SettingsScreenProps {
  onBack?: () => void;
  onReplayOnboarding?: () => void;
  testID?: string;
}

export function SettingsScreen({
  onBack,
  onReplayOnboarding,
  testID = 'settings-screen',
}: SettingsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const currentTheme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  const currentLang = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  const themeOptions: { key: ThemePreference; label: string }[] = [
    { key: 'system', label: t('settings.themeSystem') },
    { key: 'light', label: t('settings.themeLight') },
    { key: 'dark', label: t('settings.themeDark') },
  ];

  const languageOptions: { key: SupportedLanguage; label: string }[] = [
    { key: 'es', label: 'Español (es)' },
    { key: 'en', label: 'English (en)' },
  ];

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {/* Header */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backButton}
            testID="settings-back-btn"
          >
            <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>←</Text>
          </Pressable>
        ) : (
          <View style={{ width: 48 }} />
        )}

        <Text
          style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
          testID="settings-title"
        >
          {t('settings.title')}
        </Text>

        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
            ]}
          >
            {t('settings.theme')}
          </Text>

          <View style={styles.chipsRow} testID="theme-selector-row">
            {themeOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={currentTheme === opt.key}
                onPress={() => setTheme(opt.key)}
                style={{ marginRight: theme.spacing.sm, marginBottom: theme.spacing.xs }}
                testID={`theme-chip-${opt.key}`}
              />
            ))}
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
            ]}
          >
            {t('settings.language')}
          </Text>

          <View style={styles.chipsRow} testID="language-selector-row">
            {languageOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={currentLang === opt.key}
                onPress={() => setLanguage(opt.key)}
                style={{ marginRight: theme.spacing.sm }}
                testID={`lang-chip-${opt.key}`}
              />
            ))}
          </View>
        </View>

        {/* Account & Sync Section */}
        <View style={styles.section}>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
            ]}
          >
            {t('settings.accountSection')}
          </Text>

          <Card variant="outlined" style={styles.card}>
            <View style={styles.cardRow}>
              <Badge label="Local" variant="healthy" size="sm" />
              <Text
                style={[
                  theme.typography.subhead,
                  { color: theme.colors.textPrimary, marginLeft: 8, flex: 1 },
                ]}
                testID="settings-account-placeholder"
              >
                {t('settings.accountPlaceholder')}
              </Text>
            </View>
          </Card>
        </View>

        {/* About & Credits Section */}
        <View style={styles.section}>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
            ]}
          >
            {t('settings.about')}
          </Text>

          <Card variant="elevated" style={styles.card}>
            <View style={styles.itemRow}>
              <Text style={[theme.typography.title3, { color: theme.colors.primary }]}>
                HealthyCrop
              </Text>
              <Badge label="v0.2.0-dev" variant="neutral" size="sm" />
            </View>

            <Text
              style={[
                theme.typography.subhead,
                { color: theme.colors.textSecondary, marginTop: 4, marginBottom: 12 },
              ]}
            >
              {`${t('settings.author')}: Keylor Pineda (@keylorpineda)`}
            </Text>

            <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={{ marginTop: 12 }}>
              <Text style={[theme.typography.bodyBold, { color: theme.colors.textPrimary }]}>
                {t('settings.modelTitle')}
              </Text>
              <Text
                style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}
                testID="settings-model-details"
              >
                {t('settings.modelDetails')}
              </Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={[theme.typography.bodyBold, { color: theme.colors.textPrimary }]}>
                {t('settings.datasetsTitle')}
              </Text>
              <Text
                style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}
                testID="settings-dataset-details"
              >
                {t('settings.datasetsDetails')}
              </Text>
            </View>

            {onReplayOnboarding ? (
              <View style={{ marginTop: 16 }}>
                <Button
                  title="Ver introducción (Onboarding)"
                  onPress={onReplayOnboarding}
                  variant="outline"
                  size="md"
                  testID="settings-replay-onboarding-btn"
                />
              </View>
            ) : null}
          </Card>
        </View>

        {/* Mandatory Agronomic Disclaimer */}
        <View
          style={[
            styles.disclaimerContainer,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
          testID="settings-disclaimer-box"
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  card: {
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  disclaimerContainer: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
});

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip } from '@/components/ui';
import { type SupportedLanguage } from '@/i18n';
import { toAuthError } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { type ThemePreference, usePreferencesStore } from '@/stores/preferences';
import { useSyncStore } from '@/stores/sync';
import { useTheme } from '@/theme';

import { confirmSignOut } from './confirmSignOut';

export interface SettingsScreenProps {
  onBack?: () => void;
  onReplayOnboarding?: () => void;
  onSignIn?: () => void;
  onManageAccount?: () => void;
  testID?: string;
}

export function SettingsScreen({
  onBack,
  onReplayOnboarding,
  onSignIn,
  onManageAccount,
  testID = 'settings-screen',
}: SettingsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const currentTheme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  const currentLang = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  const authUser = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const syncPhase = useSyncStore((state) => state.phase);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const requestSync = useSyncStore((state) => state.requestSync);
  const refreshPending = useSyncStore((state) => state.refreshPending);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  const handleSignOut = () =>
    confirmSignOut(t, () => {
      setSignOutError(null);
      signOut().catch((error: unknown) =>
        setSignOutError(`auth.errors.${toAuthError(error).code}`),
      );
    });

  const lastSyncedLabel = lastSyncedAt
    ? t('settings.lastSynced', {
        time: new Date(lastSyncedAt).toLocaleString(currentLang === 'en' ? 'en-US' : 'es-CR', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      })
    : t('settings.neverSynced');

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
            <Text
              importantForAccessibility="no"
              accessible={false}
              style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
            >
              ←
            </Text>
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
              <Badge
                label={authUser ? 'Cloud' : 'Local'}
                variant={authUser ? 'neutral' : 'healthy'}
                size="sm"
              />
              <Text
                style={[
                  theme.typography.subhead,
                  { color: theme.colors.textPrimary, marginLeft: 8, flex: 1 },
                ]}
                testID="settings-account-status"
              >
                {authUser
                  ? t('settings.accountSignedIn', { email: authUser.email ?? '' })
                  : t('settings.accountPlaceholder')}
              </Text>
            </View>

            {authUser ? (
              <View style={{ marginTop: theme.spacing.md }} testID="settings-sync-details">
                <Text
                  style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                  testID="settings-last-synced"
                >
                  {lastSyncedLabel}
                </Text>
                <Text
                  style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                  testID="settings-pending-count"
                >
                  {pendingCount > 0
                    ? t('sync.pending', { count: pendingCount })
                    : t('settings.nothingPending')}
                </Text>
                <Button
                  title={t('settings.syncNow')}
                  onPress={() => void requestSync()}
                  loading={syncPhase === 'syncing'}
                  disabled={syncPhase === 'syncing'}
                  variant="primary"
                  size="md"
                  fullWidth
                  style={{ marginTop: theme.spacing.md }}
                  testID="settings-sync-now-btn"
                />
                {onManageAccount ? (
                  <Button
                    title={t('settings.accountManage')}
                    onPress={onManageAccount}
                    variant="outline"
                    size="md"
                    fullWidth
                    style={{ marginTop: theme.spacing.sm }}
                    testID="settings-manage-account-btn"
                  />
                ) : null}
                <Button
                  title={t('auth.signOut')}
                  onPress={handleSignOut}
                  variant="ghost"
                  size="md"
                  fullWidth
                  style={{ marginTop: theme.spacing.sm }}
                  testID="settings-sign-out-btn"
                />
                {signOutError ? (
                  <Text
                    accessibilityRole="alert"
                    style={[theme.typography.caption, { color: theme.colors.status.actNow.text }]}
                    testID="settings-sign-out-error"
                  >
                    {t(signOutError)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!authUser && onSignIn ? (
              <Button
                title={t('settings.accountSignIn')}
                onPress={onSignIn}
                variant="primary"
                size="md"
                fullWidth
                style={{ marginTop: theme.spacing.md }}
                testID="settings-sign-in-btn"
              />
            ) : null}
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
                HealthyCropping
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
    minHeight: 56,
    paddingVertical: 8,
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

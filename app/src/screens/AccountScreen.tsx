import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { toAuthError } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

import { confirmSignOut } from './confirmSignOut';

export interface AccountScreenProps {
  onBack?: () => void;
  onSignedOut?: () => void;
  testID?: string;
}

/** Minimal account management: shows the signed-in email and signs out. */
export function AccountScreen({
  onBack,
  onSignedOut,
  testID = 'account-screen',
}: AccountScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      onSignedOut?.();
    } catch (err) {
      setError(`auth.errors.${toAuthError(err).code}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backButton}
            testID="account-back-btn"
          >
            <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>←</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text
          accessibilityRole="header"
          style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
        >
          {t('auth.accountTitle')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <View style={{ padding: theme.spacing.xl }}>
        <Card variant="outlined" style={{ padding: theme.spacing.lg }}>
          <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>
            {t('auth.signedInAs')}
          </Text>
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginTop: theme.spacing.xxs },
            ]}
            testID="account-email"
          >
            {user?.email ?? '—'}
          </Text>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textTertiary, marginTop: theme.spacing.md },
            ]}
          >
            {t('auth.accountNote')}
          </Text>
        </Card>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={[
              theme.typography.subhead,
              { color: theme.colors.status.actNow.text, marginTop: theme.spacing.md },
            ]}
            testID="account-error"
          >
            {t(error)}
          </Text>
        ) : null}

        <Button
          title={t('auth.signOut')}
          onPress={() => confirmSignOut(t, () => void handleSignOut())}
          variant="danger"
          loading={busy}
          disabled={busy}
          fullWidth
          style={{ marginTop: theme.spacing.xxl }}
          testID="account-sign-out-btn"
        />
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
});

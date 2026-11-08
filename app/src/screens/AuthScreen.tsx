import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/ui';
import { toAuthError } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export type AuthMode = 'signIn' | 'signUp';

/** Firebase accepts passwords of 6+ characters; the app enforces the same floor. */
export const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CredentialErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

/** Validate the form locally and return i18n keys for each invalid field. */
export function validateCredentials(
  mode: AuthMode,
  email: string,
  password: string,
  confirm: string,
): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'auth.validation.emailInvalid';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = 'auth.validation.passwordTooShort';
  }
  if (mode === 'signUp' && confirm !== password) {
    errors.confirm = 'auth.validation.passwordMismatch';
  }
  return errors;
}

export interface AuthScreenProps {
  mode: AuthMode;
  onSuccess?: () => void;
  onSkip?: () => void;
  onSwitchMode?: () => void;
  testID?: string;
}

export function AuthScreen({
  mode,
  onSuccess,
  onSkip,
  onSwitchMode,
  testID = 'auth-screen',
}: AuthScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signUp';

  const handleSubmit = async () => {
    const errors = validateCredentials(mode, email, password, confirm);
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSubmitting(true);
    try {
      await (isSignUp ? signUp(email, password) : signIn(email, password));
      onSuccess?.();
    } catch (error) {
      setSubmitError(`auth.errors.${toAuthError(error).code}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { padding: theme.spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            style={[theme.typography.title1, { color: theme.colors.textPrimary }]}
            testID="auth-title"
          >
            {t(isSignUp ? 'auth.signUpTitle' : 'auth.signInTitle')}
          </Text>
          <Text
            style={[
              theme.typography.body,
              {
                color: theme.colors.textSecondary,
                marginTop: theme.spacing.xs,
                marginBottom: theme.spacing.xxl,
              },
            ]}
          >
            {t(isSignUp ? 'auth.signUpSubtitle' : 'auth.signInSubtitle')}
          </Text>

          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!submitting}
            error={fieldErrors.email ? t(fieldErrors.email) : null}
            testID="auth-email-input"
          />
          <TextField
            label={t('auth.password')}
            hint={t('auth.passwordHint')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            returnKeyType={isSignUp ? 'next' : 'done'}
            onSubmitEditing={isSignUp ? undefined : () => void handleSubmit()}
            editable={!submitting}
            error={fieldErrors.password ? t(fieldErrors.password) : null}
            testID="auth-password-input"
          />
          {isSignUp ? (
            <TextField
              label={t('auth.confirmPassword')}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={() => void handleSubmit()}
              editable={!submitting}
              error={fieldErrors.confirm ? t(fieldErrors.confirm) : null}
              testID="auth-confirm-input"
            />
          ) : null}

          {submitError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                theme.typography.subhead,
                { color: theme.colors.status.actNow.text, marginBottom: theme.spacing.md },
              ]}
              testID="auth-submit-error"
            >
              {t(submitError)}
            </Text>
          ) : null}

          <Button
            title={t(isSignUp ? 'auth.signUp' : 'auth.signIn')}
            onPress={() => void handleSubmit()}
            loading={submitting}
            disabled={submitting}
            fullWidth
            size="lg"
            testID="auth-submit-btn"
          />

          {onSwitchMode ? (
            <Pressable
              onPress={onSwitchMode}
              accessibilityRole="link"
              accessibilityLabel={t(isSignUp ? 'auth.toSignIn' : 'auth.toSignUp')}
              accessibilityState={{ disabled: submitting }}
              disabled={submitting}
              style={styles.link}
              testID="auth-switch-mode-btn"
            >
              <Text style={[theme.typography.callout, { color: theme.colors.primary }]}>
                {t(isSignUp ? 'auth.toSignIn' : 'auth.toSignUp')}
              </Text>
            </Pressable>
          ) : null}

          <View
            style={[
              styles.offlineBox,
              {
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.radii.md,
                marginTop: theme.spacing.xxl,
                padding: theme.spacing.lg,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.subhead,
                { color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
              ]}
            >
              {t('auth.offlineNote')}
            </Text>
            {onSkip ? (
              <Button
                title={t('auth.skip')}
                onPress={onSkip}
                variant="outline"
                disabled={submitting}
                fullWidth
                testID="auth-skip-btn"
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export type SignInScreenProps = Omit<AuthScreenProps, 'mode'>;

export function SignInScreen(props: SignInScreenProps): React.JSX.Element {
  return <AuthScreen mode="signIn" testID="sign-in-screen" {...props} />;
}

export function SignUpScreen(props: SignInScreenProps): React.JSX.Element {
  return <AuthScreen mode="signUp" testID="sign-up-screen" {...props} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  link: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  offlineBox: {
    borderWidth: 1,
  },
});

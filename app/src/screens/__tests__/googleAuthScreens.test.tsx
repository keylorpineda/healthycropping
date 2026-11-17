import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import i18n from '@/i18n';
import en from '@/i18n/locales/en.json';
import * as authService from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { ThemeProvider } from '@/theme';
import { AccountScreen, SignInScreen } from '../index';

jest.mock('@/services/auth', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  subscribeToAuthChanges: jest.fn(() => () => undefined),
  toAuthError: (error: { code?: string }) => ({ code: error?.code ?? 'unknown' }),
  isGoogleSignInConfigured: jest.fn(() => false),
  pendingGoogleLinkEmail: jest.fn(() => null),
  signInWithGoogle: jest.fn(),
  linkGoogleAccount: jest.fn(),
  GOOGLE_PROVIDER_ID: 'google.com',
}));

const mocked = authService as jest.Mocked<typeof authService>;

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Google auth screens', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'signedOut', user: null });
    await i18n.changeLanguage('en');
  });

  describe('SignInScreen', () => {
    it('shows the Google button only when Google sign-in is configured', () => {
      mocked.isGoogleSignInConfigured.mockReturnValue(false);
      const { unmount } = renderWithTheme(<SignInScreen />);
      expect(screen.queryByTestId('auth-google-btn')).toBeNull();
      unmount();

      mocked.isGoogleSignInConfigured.mockReturnValue(true);
      renderWithTheme(<SignInScreen />);
      expect(screen.getByTestId('auth-google-btn')).toHaveTextContent('Continue with Google');
    });

    it('calls onSuccess when Google sign-in resolves a user and stays quiet when cancelled', async () => {
      mocked.isGoogleSignInConfigured.mockReturnValue(true);
      const onSuccess = jest.fn();
      const { unmount } = renderWithTheme(<SignInScreen onSuccess={onSuccess} />);

      mocked.signInWithGoogle.mockResolvedValueOnce(null);
      fireEvent.press(screen.getByTestId('auth-google-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('auth-google-btn')).toHaveProp('accessibilityState', {
          busy: false,
          disabled: false,
        }),
      );
      expect(mocked.signInWithGoogle).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(screen.queryByTestId('auth-submit-error')).toBeNull();
      unmount();

      mocked.signInWithGoogle.mockResolvedValueOnce({
        uid: 'u1',
        email: 'ana@gmail.com',
        providers: ['google.com'],
      });
      renderWithTheme(<SignInScreen onSuccess={onSuccess} />);
      fireEvent.press(screen.getByTestId('auth-google-btn'));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    });

    it('shows the account-exists error and pre-fills the pending Google email', async () => {
      mocked.isGoogleSignInConfigured.mockReturnValue(true);
      mocked.signInWithGoogle.mockRejectedValueOnce({ code: 'account-exists' });
      mocked.pendingGoogleLinkEmail.mockReturnValue('ana@gmail.com');

      renderWithTheme(<SignInScreen />);
      fireEvent.press(screen.getByTestId('auth-google-btn'));

      expect(await screen.findByTestId('auth-submit-error')).toHaveTextContent(
        en.auth.errors['account-exists'],
      );
      expect(screen.getByTestId('auth-email-input').props.value).toBe('ana@gmail.com');
    });
  });

  describe('AccountScreen', () => {
    it('links a Google account for a password user and updates the screen to linked', async () => {
      mocked.isGoogleSignInConfigured.mockReturnValue(true);
      useAuthStore.setState({
        status: 'signedIn',
        user: { uid: 'u1', email: 'ana@gmail.com', providers: ['password'] },
      });
      mocked.linkGoogleAccount.mockResolvedValueOnce({
        uid: 'u1',
        email: 'ana@gmail.com',
        providers: ['password', 'google.com'],
      });

      renderWithTheme(<AccountScreen />);
      fireEvent.press(screen.getByTestId('account-link-google-btn'));

      expect(await screen.findByTestId('account-google-linked')).toBeTruthy();
      expect(mocked.linkGoogleAccount).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('account-link-google-btn')).toBeNull();
    });

    it('shows the linked badge without a link button when Google is already linked', () => {
      mocked.isGoogleSignInConfigured.mockReturnValue(true);
      useAuthStore.setState({
        status: 'signedIn',
        user: { uid: 'u1', email: 'ana@gmail.com', providers: ['password', 'google.com'] },
      });

      renderWithTheme(<AccountScreen />);
      expect(screen.getByTestId('account-google-linked')).toBeTruthy();
      expect(screen.queryByTestId('account-link-google-btn')).toBeNull();
    });

    it('shows the google-in-use error when linking fails', async () => {
      mocked.isGoogleSignInConfigured.mockReturnValue(true);
      useAuthStore.setState({
        status: 'signedIn',
        user: { uid: 'u1', email: 'ana@gmail.com', providers: ['password'] },
      });
      mocked.linkGoogleAccount.mockRejectedValueOnce({ code: 'google-in-use' });

      renderWithTheme(<AccountScreen />);
      fireEvent.press(screen.getByTestId('account-link-google-btn'));

      expect(await screen.findByTestId('account-error')).toHaveTextContent(
        en.auth.errors['google-in-use'],
      );
    });
  });
});

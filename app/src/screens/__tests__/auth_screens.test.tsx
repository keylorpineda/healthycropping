import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import i18n from '@/i18n';
import * as authService from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { ThemeProvider } from '@/theme';
import { AccountScreen, SignInScreen, SignUpScreen, validateCredentials } from '../index';

jest.mock('@/services/auth', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  subscribeToAuthChanges: jest.fn(() => () => undefined),
  toAuthError: (error: { code?: string }) => ({ code: error?.code ?? 'unknown' }),
}));

const mocked = authService as jest.Mocked<typeof authService>;
const USER = { uid: 'u1', email: 'ana@finca.cr' };

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function fillForm(email: string, password: string, confirm?: string) {
  fireEvent.changeText(screen.getByTestId('auth-email-input'), email);
  fireEvent.changeText(screen.getByTestId('auth-password-input'), password);
  if (confirm !== undefined) {
    fireEvent.changeText(screen.getByTestId('auth-confirm-input'), confirm);
  }
}

describe('Auth screens', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'signedOut', user: null });
    await i18n.changeLanguage('es');
  });

  describe('validateCredentials', () => {
    it('flags invalid email, short password and mismatched confirmation', () => {
      expect(validateCredentials('signUp', 'nope', '123', '456')).toEqual({
        email: 'auth.validation.emailInvalid',
        password: 'auth.validation.passwordTooShort',
        confirm: 'auth.validation.passwordMismatch',
      });
    });

    it('ignores the confirmation field when signing in', () => {
      expect(validateCredentials('signIn', ' ana@finca.cr ', 'secret1', '')).toEqual({});
    });
  });

  describe('SignInScreen', () => {
    it('shows validation errors without calling Firebase', () => {
      renderWithTheme(<SignInScreen />);
      fillForm('not-an-email', '123');
      fireEvent.press(screen.getByTestId('auth-submit-btn'));

      expect(screen.getByTestId('auth-email-input-error')).toHaveTextContent(
        'Ingresa un correo electrónico válido.',
      );
      expect(screen.getByTestId('auth-password-input-error')).toBeTruthy();
      expect(mocked.signIn).not.toHaveBeenCalled();
    });

    it('signs in and reports success', async () => {
      mocked.signIn.mockResolvedValueOnce(USER);
      const onSuccess = jest.fn();
      renderWithTheme(<SignInScreen onSuccess={onSuccess} />);

      fillForm('ana@finca.cr', 'secret1');
      fireEvent.press(screen.getByTestId('auth-submit-btn'));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(mocked.signIn).toHaveBeenCalledWith('ana@finca.cr', 'secret1');
      expect(useAuthStore.getState().user).toEqual(USER);
    });

    it('shows a translated Firebase error', async () => {
      mocked.signIn.mockRejectedValueOnce({ code: 'invalid-credential' });
      renderWithTheme(<SignInScreen />);

      fillForm('ana@finca.cr', 'wrongpass');
      fireEvent.press(screen.getByTestId('auth-submit-btn'));

      expect(await screen.findByTestId('auth-submit-error')).toHaveTextContent(
        'Correo o contraseña incorrectos.',
      );
    });

    it('lets the user skip authentication and switch to sign-up', () => {
      const onSkip = jest.fn();
      const onSwitchMode = jest.fn();
      renderWithTheme(<SignInScreen onSkip={onSkip} onSwitchMode={onSwitchMode} />);

      fireEvent.press(screen.getByTestId('auth-skip-btn'));
      fireEvent.press(screen.getByTestId('auth-switch-mode-btn'));
      expect(onSkip).toHaveBeenCalled();
      expect(onSwitchMode).toHaveBeenCalled();
    });

    it('renders in English', async () => {
      await i18n.changeLanguage('en');
      renderWithTheme(<SignInScreen />);
      expect(screen.getByTestId('auth-title')).toHaveTextContent('Sign in');
    });
  });

  describe('SignUpScreen', () => {
    it('requires matching passwords', () => {
      renderWithTheme(<SignUpScreen />);
      fillForm('ana@finca.cr', 'secret1', 'secret2');
      fireEvent.press(screen.getByTestId('auth-submit-btn'));

      expect(screen.getByTestId('auth-confirm-input-error')).toHaveTextContent(
        'Las contraseñas no coinciden.',
      );
      expect(mocked.signUp).not.toHaveBeenCalled();
    });

    it('creates the account', async () => {
      mocked.signUp.mockResolvedValueOnce(USER);
      const onSuccess = jest.fn();
      renderWithTheme(<SignUpScreen onSuccess={onSuccess} />);

      fillForm('ana@finca.cr', 'secret1', 'secret1');
      fireEvent.press(screen.getByTestId('auth-submit-btn'));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(mocked.signUp).toHaveBeenCalledWith('ana@finca.cr', 'secret1');
    });

    it('explains when the email is already registered', async () => {
      mocked.signUp.mockRejectedValueOnce({ code: 'email-already-in-use' });
      renderWithTheme(<SignUpScreen />);

      fillForm('ana@finca.cr', 'secret1', 'secret1');
      fireEvent.press(screen.getByTestId('auth-submit-btn'));

      expect(await screen.findByTestId('auth-submit-error')).toHaveTextContent(
        'Ya existe una cuenta con este correo.',
      );
    });
  });

  describe('AccountScreen', () => {
    it('shows the signed-in email and signs out', async () => {
      useAuthStore.setState({ status: 'signedIn', user: USER });
      mocked.signOut.mockResolvedValueOnce();
      const onSignedOut = jest.fn();
      renderWithTheme(<AccountScreen onSignedOut={onSignedOut} />);

      expect(screen.getByTestId('account-email')).toHaveTextContent('ana@finca.cr');
      fireEvent.press(screen.getByTestId('account-sign-out-btn'));

      await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
      expect(useAuthStore.getState().status).toBe('signedOut');
    });
  });
});

import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import i18n from '@/i18n';
import * as registry from '@/ml/registry';
import { useAuthStore } from '@/stores/auth';
import { usePreferencesStore } from '@/stores/preferences';
import { useSyncStore } from '@/stores/sync';
import { ThemeProvider } from '@/theme';
import { HomeScreen, OnboardingScreen, SettingsScreen } from '../index';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Screen Suite: Onboarding, Home & Settings', () => {
  beforeEach(async () => {
    usePreferencesStore.getState().resetPreferences();
    await i18n.changeLanguage('es');
  });

  describe('OnboardingScreen', () => {
    it('renders slide 1 and navigates through 3 slides to disclaimer acceptance', () => {
      const onCompleteMock = jest.fn();
      renderWithTheme(<OnboardingScreen onComplete={onCompleteMock} />);

      // Slide 1
      expect(screen.getByTestId('slide-1-title')).toHaveTextContent('Diagnóstico fuera de línea');
      expect(screen.getByTestId('onboarding-dots')).toBeTruthy();

      // Tap Next -> Slide 2
      const nextBtn = screen.getByTestId('onboarding-next-btn');
      fireEvent.press(nextBtn);
      expect(screen.getByTestId('slide-2-title')).toHaveTextContent(
        'Modelos precisos y calibrados',
      );

      // Tap Next -> Slide 3 (Disclaimer)
      fireEvent.press(nextBtn);
      expect(screen.getByTestId('slide-3-title')).toHaveTextContent(
        'Herramienta de apoyo al productor',
      );
      expect(screen.getByTestId('onboarding-disclaimer-box')).toHaveTextContent(
        /no reemplaza el criterio/i,
      );

      // Start button is disabled until disclaimer is accepted
      const startBtn = screen.getByTestId('onboarding-start-btn');
      expect(startBtn.props.accessibilityState.disabled).toBe(true);

      // Check disclaimer checkbox
      const checkbox = screen.getByTestId('onboarding-disclaimer-checkbox');
      fireEvent.press(checkbox);

      // Now start button should be enabled
      expect(startBtn.props.accessibilityState.disabled).toBe(false);
      fireEvent.press(startBtn);

      expect(usePreferencesStore.getState().hasCompletedOnboarding).toBe(true);
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
    });

    it('skip button jumps directly to final disclaimer slide', () => {
      renderWithTheme(<OnboardingScreen />);

      const skipBtn = screen.getByTestId('onboarding-skip-btn');
      fireEvent.press(skipBtn);

      expect(screen.getByTestId('slide-3-title')).toBeTruthy();
      expect(screen.getByTestId('onboarding-disclaimer-box')).toBeTruthy();
    });

    it('renders correctly in English when language is en', async () => {
      await i18n.changeLanguage('en');
      renderWithTheme(<OnboardingScreen />);

      expect(screen.getByTestId('slide-1-title')).toHaveTextContent('Offline Crop Diagnosis');
    });
  });

  describe('HomeScreen', () => {
    it('renders header, crop selector chips, scan CTA, and empty state', () => {
      const onOpenSettingsMock = jest.fn();
      const onScanMock = jest.fn();

      renderWithTheme(<HomeScreen onOpenSettings={onOpenSettingsMock} onScan={onScanMock} />);

      expect(screen.getByTestId('home-title')).toHaveTextContent('HealthyCropping');
      expect(screen.getByTestId('home-tagline')).toHaveTextContent(
        'Diagnóstico de cultivos fuera de línea',
      );
      expect(screen.getByTestId('home-offline-badge')).toHaveTextContent('100% Fuera de línea');

      // Settings button
      const settingsBtn = screen.getByTestId('home-settings-btn');
      fireEvent.press(settingsBtn);
      expect(onOpenSettingsMock).toHaveBeenCalledTimes(1);

      // Crop selector chips: Coffee is selected by default
      const coffeeChip = screen.getByTestId('crop-chip-coffee');
      const cacaoChip = screen.getByTestId('crop-chip-cacao');
      expect(coffeeChip.props.accessibilityState.selected).toBe(true);
      expect(cacaoChip.props.accessibilityState.selected).toBe(false);

      // Select Cacao
      fireEvent.press(cacaoChip);
      expect(cacaoChip.props.accessibilityState.selected).toBe(true);

      // Scan CTA with Cacao
      const scanBtn = screen.getByTestId('home-scan-cta-btn');
      fireEvent.press(scanBtn);
      expect(onScanMock).toHaveBeenCalledWith('cacao');

      // Select Banana and scan with it
      const bananaChip = screen.getByTestId('crop-chip-banana');
      expect(bananaChip.props.accessibilityState.disabled).toBe(false);
      fireEvent.press(bananaChip);
      expect(bananaChip.props.accessibilityState.selected).toBe(true);
      fireEvent.press(scanBtn);
      expect(onScanMock).toHaveBeenLastCalledWith('banana');

      // Empty State
      expect(screen.getByTestId('home-empty-state')).toBeTruthy();

      // Agronomic Disclaimer present
      expect(screen.getByTestId('home-disclaimer-box')).toHaveTextContent(
        /no reemplaza el criterio/i,
      );
    });

    it('disables crops without a bundled model and labels them as coming soon', () => {
      const spy = jest
        .spyOn(registry, 'isCropAvailable')
        .mockImplementation((crop) => crop !== 'banana');
      try {
        renderWithTheme(<HomeScreen />);
        const bananaChip = screen.getByTestId('crop-chip-banana');
        expect(bananaChip.props.accessibilityState.disabled).toBe(true);
        expect(bananaChip).toHaveTextContent('Banano (Próximamente)');
        fireEvent.press(bananaChip);
        expect(bananaChip.props.accessibilityState.selected).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('displays English text when language is switched', async () => {
      await i18n.changeLanguage('en');
      renderWithTheme(<HomeScreen />);

      expect(screen.getByTestId('home-offline-badge')).toHaveTextContent('100% Offline');
      expect(screen.getByTestId('home-disclaimer-box')).toHaveTextContent(
        /does not replace the judgment/i,
      );
    });
  });

  describe('SettingsScreen', () => {
    it('allows changing theme and language preferences', async () => {
      const onBackMock = jest.fn();
      renderWithTheme(<SettingsScreen onBack={onBackMock} />);

      // Back button
      const backBtn = screen.getByTestId('settings-back-btn');
      fireEvent.press(backBtn);
      expect(onBackMock).toHaveBeenCalledTimes(1);

      // Switch theme to dark
      const darkChip = screen.getByTestId('theme-chip-dark');
      fireEvent.press(darkChip);
      expect(usePreferencesStore.getState().theme).toBe('dark');

      // Switch language to en
      const enChip = screen.getByTestId('lang-chip-en');
      fireEvent.press(enChip);
      expect(usePreferencesStore.getState().language).toBe('en');
      expect(i18n.language).toBe('en');

      // Model and Dataset Credits displayed
      expect(screen.getByTestId('settings-model-details')).toHaveTextContent(
        /MobileNetV3-Large Float16/,
      );
      expect(screen.getByTestId('settings-dataset-details')).toHaveTextContent(/RoCoLe.*BRACOL/);

      // Disclaimer present
      expect(screen.getByTestId('settings-disclaimer-box')).toHaveTextContent(
        /does not replace the judgment/i,
      );
    });

    it('offers sign-in while signed out and keeps local mode', () => {
      useAuthStore.setState({ status: 'signedOut', user: null });
      const onSignIn = jest.fn();
      renderWithTheme(<SettingsScreen onSignIn={onSignIn} onManageAccount={jest.fn()} />);

      expect(screen.getByTestId('settings-account-status')).toHaveTextContent(
        'Modo local activo (no requiere cuenta)',
      );
      expect(screen.queryByTestId('settings-manage-account-btn')).toBeNull();
      fireEvent.press(screen.getByTestId('settings-sign-in-btn'));
      expect(onSignIn).toHaveBeenCalledTimes(1);
    });

    describe('signed-in account section', () => {
      const pressAlertButton = (style: AlertButton['style']) =>
        jest.spyOn(Alert, 'alert').mockImplementationOnce((_t, _m, buttons) => {
          (buttons as AlertButton[]).find((b) => b.style === style)?.onPress?.();
        });

      beforeEach(() => {
        useAuthStore.setState({ status: 'signedIn', user: { uid: 'u1', email: 'ana@finca.cr' } });
        useSyncStore.setState({
          phase: 'synced',
          pendingCount: 2,
          lastSyncedAt: '2026-11-07T15:30:00.000Z',
          refreshPending: jest.fn(),
        });
      });

      it('shows the last sync time and pending changes', () => {
        renderWithTheme(<SettingsScreen />);
        expect(screen.getByTestId('settings-last-synced')).toHaveTextContent(
          /Última sincronización: .*2026/,
        );
        expect(screen.getByTestId('settings-pending-count')).toHaveTextContent(
          '2 cambios pendientes',
        );
      });

      it('says when nothing was synced yet', () => {
        useSyncStore.setState({ lastSyncedAt: null, pendingCount: 0 });
        renderWithTheme(<SettingsScreen />);
        expect(screen.getByTestId('settings-last-synced')).toHaveTextContent(
          'Aún no se ha sincronizado',
        );
        expect(screen.getByTestId('settings-pending-count')).toHaveTextContent(
          'Todo está sincronizado',
        );
      });

      it('runs a manual sync', () => {
        const requestSync = jest.fn(() => Promise.resolve());
        useSyncStore.setState({ requestSync });
        renderWithTheme(<SettingsScreen />);

        fireEvent.press(screen.getByTestId('settings-sync-now-btn'));
        expect(requestSync).toHaveBeenCalledTimes(1);
      });

      it('signs out only after confirmation', async () => {
        const signOut = jest.fn(() => Promise.resolve());
        useAuthStore.setState({ signOut });
        renderWithTheme(<SettingsScreen />);

        pressAlertButton('cancel');
        fireEvent.press(screen.getByTestId('settings-sign-out-btn'));
        expect(signOut).not.toHaveBeenCalled();

        pressAlertButton('destructive');
        fireEvent.press(screen.getByTestId('settings-sign-out-btn'));
        await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
      });
    });

    it('shows the signed-in email and links to account management', () => {
      useAuthStore.setState({ status: 'signedIn', user: { uid: 'u1', email: 'ana@finca.cr' } });
      const onManageAccount = jest.fn();
      renderWithTheme(<SettingsScreen onSignIn={jest.fn()} onManageAccount={onManageAccount} />);

      expect(screen.getByTestId('settings-account-status')).toHaveTextContent(
        'Sesión iniciada como ana@finca.cr',
      );
      expect(screen.queryByTestId('settings-sign-in-btn')).toBeNull();
      fireEvent.press(screen.getByTestId('settings-manage-account-btn'));
      expect(onManageAccount).toHaveBeenCalledTimes(1);
    });
  });
});

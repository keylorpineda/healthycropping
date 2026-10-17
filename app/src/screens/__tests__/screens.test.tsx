import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { usePreferencesStore } from '@/stores/preferences';
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

      expect(screen.getByTestId('home-title')).toHaveTextContent('HealthyCrop');
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

      // Empty State
      expect(screen.getByTestId('home-empty-state')).toBeTruthy();

      // Agronomic Disclaimer present
      expect(screen.getByTestId('home-disclaimer-box')).toHaveTextContent(
        /no reemplaza el criterio/i,
      );
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
  });
});

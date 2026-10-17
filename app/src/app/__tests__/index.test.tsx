import React from 'react';
import { render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { usePreferencesStore } from '@/stores/preferences';
import { ThemeProvider } from '@/theme';
import IndexScreen from '../index';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('IndexScreen (App Entrypoint / Router Dispatcher)', () => {
  beforeEach(async () => {
    usePreferencesStore.getState().resetPreferences();
    await i18n.changeLanguage('es');
  });

  it('renders OnboardingScreen by default for first-time users', () => {
    expect(usePreferencesStore.getState().hasCompletedOnboarding).toBe(false);
    renderWithTheme(<IndexScreen />);

    expect(screen.getByTestId('onboarding-screen')).toBeTruthy();
    expect(screen.getByTestId('slide-1-title')).toHaveTextContent('Diagnóstico fuera de línea');
  });

  it('renders HomeScreen once onboarding has been completed', () => {
    usePreferencesStore.getState().setHasCompletedOnboarding(true);
    renderWithTheme(<IndexScreen />);

    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('home-title')).toHaveTextContent('HealthyCrop');
    expect(screen.getByTestId('home-tagline')).toHaveTextContent(
      'Diagnóstico de cultivos fuera de línea',
    );
    expect(screen.getByTestId('home-disclaimer-box')).toHaveTextContent(
      /no reemplaza el criterio/i,
    );
  });

  it('updates rendered Home copy when language changes to English', async () => {
    usePreferencesStore.getState().setHasCompletedOnboarding(true);
    await i18n.changeLanguage('en');
    renderWithTheme(<IndexScreen />);

    expect(screen.getByTestId('home-title')).toHaveTextContent('HealthyCrop');
    expect(screen.getByTestId('home-tagline')).toHaveTextContent('Offline crop diagnosis');
    expect(screen.getByTestId('home-disclaimer-box')).toHaveTextContent(
      /does not replace the judgment/i,
    );
  });
});

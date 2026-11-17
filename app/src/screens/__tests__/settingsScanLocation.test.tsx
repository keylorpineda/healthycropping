import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';

import { initDatabase } from '@/db';
import i18n from '@/i18n';
import { SettingsScreen } from '@/screens';
import { usePreferencesStore } from '@/stores/preferences';
import { ThemeProvider } from '@/theme';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

function permissionResult(granted: boolean): Location.LocationPermissionResponse {
  return {
    granted,
    status: (granted ? 'granted' : 'denied') as Location.PermissionStatus,
    expires: 'never',
    canAskAgain: true,
  };
}

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('SettingsScreen scan location toggle', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
    usePreferencesStore.getState().resetPreferences();
    await i18n.changeLanguage('en');
  });

  it('selects scan-location-chip-on when permission is granted', async () => {
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValueOnce(permissionResult(true));

    renderWithTheme(<SettingsScreen />);

    expect(screen.getByTestId('scan-location-chip-off')).toBeSelected();
    expect(screen.getByTestId('scan-location-chip-on')).not.toBeSelected();

    fireEvent.press(screen.getByTestId('scan-location-chip-on'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-location-chip-on')).toBeSelected();
    });
    expect(screen.getByTestId('scan-location-chip-off')).not.toBeSelected();
    expect(screen.queryByTestId('scan-location-denied')).toBeNull();
  });

  it('shows scan-location-denied and keeps Off selected when permission is denied', async () => {
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValueOnce(permissionResult(false));

    renderWithTheme(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('scan-location-chip-on'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-location-denied')).toHaveTextContent(
        'Location permission denied. You can grant it in Android settings.',
      );
    });
    expect(screen.getByTestId('scan-location-chip-off')).toBeSelected();
    expect(screen.getByTestId('scan-location-chip-on')).not.toBeSelected();
  });
});

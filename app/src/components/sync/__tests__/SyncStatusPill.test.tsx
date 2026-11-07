import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { ThemeProvider } from '@/theme';
import { SyncStatusPill } from '../SyncStatusPill';

jest.mock('@/services/sync', () => ({
  ...jest.requireActual('@/services/sync'),
  syncAll: jest.fn(() => Promise.resolve({ synced: 0, failed: 0, photosUploaded: 0 })),
}));

function renderPill() {
  return render(
    <ThemeProvider>
      <SyncStatusPill />
    </ThemeProvider>,
  );
}

describe('SyncStatusPill', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    useSyncStore.getState().reset();
    useAuthStore.setState({ status: 'signedIn', user: { uid: 'u1', email: 'a@b.cr' } });
  });

  it('keeps the offline badge while signed out', () => {
    useAuthStore.setState({ status: 'signedOut', user: null });
    renderPill();
    expect(screen.getByTestId('home-offline-badge')).toHaveTextContent('100% Fuera de línea');
    expect(screen.queryByTestId('sync-status-pill')).toBeNull();
  });

  it.each([
    [{ phase: 'syncing' }, 'Sincronizando…'],
    [{ phase: 'synced', pendingCount: 0 }, 'Sincronizado'],
    [{ phase: 'synced', pendingCount: 3 }, '3 cambios pendientes'],
    [{ phase: 'idle', pendingCount: 1 }, '1 cambio pendiente'],
    [{ phase: 'offline', pendingCount: 2 }, 'Sin conexión'],
    [{ phase: 'error' }, 'Error al sincronizar'],
  ] as const)('shows %j as "%s"', (state, label) => {
    useSyncStore.setState(state);
    renderPill();
    expect(screen.getByTestId('sync-status-pill-label')).toHaveTextContent(label);
  });

  it('transitions syncing -> synced and marks the pill busy while syncing', () => {
    useSyncStore.setState({ phase: 'syncing' });
    renderPill();
    expect(screen.getByTestId('sync-status-pill')).toBeBusy();

    act(() => useSyncStore.setState({ phase: 'synced', pendingCount: 0 }));
    expect(screen.getByTestId('sync-status-pill-label')).toHaveTextContent('Sincronizado');
    expect(screen.getByTestId('sync-status-pill-check')).toBeTruthy();
  });

  it('retries a sync on tap', () => {
    const requestSync = jest.fn(() => Promise.resolve());
    useSyncStore.setState({ phase: 'error', requestSync });
    renderPill();

    fireEvent.press(screen.getByTestId('sync-status-pill'));
    expect(requestSync).toHaveBeenCalled();
  });

  it('renders the final state without animation when reduce motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    useSyncStore.setState({ phase: 'synced', pendingCount: 0 });
    renderPill();
    await act(async () => undefined);

    expect(screen.getByTestId('sync-status-pill-check')).toHaveAnimatedStyle({ opacity: 1 });
  });

  it('labels in English', async () => {
    await i18n.changeLanguage('en');
    useSyncStore.setState({ phase: 'synced', pendingCount: 2 });
    renderPill();
    expect(screen.getByTestId('sync-status-pill-label')).toHaveTextContent('2 pending changes');
  });
});

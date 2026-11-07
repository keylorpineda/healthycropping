import * as syncService from '@/services/sync';
import { useAuthStore } from '../auth';
import { useSyncStore } from '../sync';

jest.mock('@/services/api', () => ({ apiClient: { isConfigured: true } }));
jest.mock('@/services/sync', () => {
  const actual = jest.requireActual('@/services/sync');
  return { ...actual, syncAll: jest.fn() };
});
jest.mock('@/db', () => ({ countPending: jest.fn(() => 2) }));

const syncAll = syncService.syncAll as jest.Mock;
const REPORT = { synced: 1, failed: 0, photosUploaded: 0 };

describe('useSyncStore', () => {
  beforeEach(() => {
    syncAll.mockReset();
    useSyncStore.getState().reset();
    useAuthStore.setState({ status: 'signedIn', user: { uid: 'u1', email: 'a@b.cr' } });
  });

  it('does nothing while signed out, but still counts pending changes', async () => {
    useAuthStore.setState({ status: 'signedOut', user: null });
    await useSyncStore.getState().requestSync();

    expect(syncAll).not.toHaveBeenCalled();
    expect(useSyncStore.getState()).toMatchObject({ phase: 'idle', pendingCount: 2 });
  });

  it('goes syncing -> synced and records the time', async () => {
    let finish: (value: typeof REPORT) => void = () => undefined;
    syncAll.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const done = useSyncStore.getState().requestSync();
    expect(useSyncStore.getState().phase).toBe('syncing');
    finish(REPORT);
    await done;

    expect(useSyncStore.getState().phase).toBe('synced');
    expect(useSyncStore.getState().lastSyncedAt).not.toBeNull();
  });

  it('shows offline when the run loses the connection', async () => {
    syncAll.mockRejectedValueOnce(new syncService.SyncInterruptedError('offline'));
    await useSyncStore.getState().requestSync();
    expect(useSyncStore.getState().phase).toBe('offline');
  });

  it('shows an error for server or session failures', async () => {
    syncAll.mockRejectedValueOnce(new syncService.SyncInterruptedError('unauthorized'));
    await useSyncStore.getState().requestSync();
    expect(useSyncStore.getState().phase).toBe('error');
  });

  it('skips the network while offline', async () => {
    useSyncStore.getState().setOnline(false);
    await useSyncStore.getState().requestSync();

    expect(syncAll).not.toHaveBeenCalled();
    expect(useSyncStore.getState().phase).toBe('offline');
  });

  it('shares one run between concurrent requests and runs once more afterwards', async () => {
    syncAll.mockResolvedValue(REPORT);
    const first = useSyncStore.getState().requestSync();
    const second = useSyncStore.getState().requestSync();

    await Promise.all([first, second]);
    expect(syncAll).toHaveBeenCalledTimes(2);
  });
});

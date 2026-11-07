import { create } from 'zustand';

import { countPending } from '@/db';
import { apiClient } from '@/services/api';
import { SyncInterruptedError, syncAll } from '@/services/sync';

import { useAuthStore } from './auth';

/**
 * Sync status shown by the status pill:
 * - `idle`: nothing has run yet (signed out, or waiting for the first trigger)
 * - `syncing`: a run is in progress (pulse)
 * - `synced`: the last run finished (checkmark)
 * - `offline`: no connection, changes wait locally
 * - `error`: the last run stopped on a server or session error
 */
export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  phase: SyncPhase;
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  refreshPending: () => void;
  setOnline: (online: boolean) => void;
  /** Run a sync now if signed in and online; concurrent calls share one run. */
  requestSync: () => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  phase: 'idle' as SyncPhase,
  isOnline: true,
  pendingCount: 0,
  lastSyncedAt: null as string | null,
};

let running: Promise<void> | null = null;
let rerunRequested = false;

function safeCountPending(): number {
  try {
    return countPending();
  } catch {
    return 0;
  }
}

export const useSyncStore = create<SyncState>((set, get) => {
  async function runOnce(): Promise<void> {
    set({ phase: 'syncing' });
    try {
      await syncAll();
      set({ phase: 'synced', lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      const offline = error instanceof SyncInterruptedError && error.reason === 'offline';
      set({ phase: offline ? 'offline' : 'error' });
    } finally {
      set({ pendingCount: safeCountPending() });
    }
  }

  return {
    ...INITIAL,

    refreshPending: () => set({ pendingCount: safeCountPending() }),

    setOnline: (isOnline) => {
      const { phase } = get();
      if (!isOnline && phase !== 'syncing') {
        set({ isOnline, phase: useAuthStore.getState().status === 'signedIn' ? 'offline' : phase });
        return;
      }
      set({ isOnline });
    },

    requestSync: () => {
      get().refreshPending();
      if (useAuthStore.getState().status !== 'signedIn' || !apiClient.isConfigured) {
        return Promise.resolve();
      }
      if (!get().isOnline) {
        set({ phase: 'offline' });
        return Promise.resolve();
      }
      if (running) {
        // Changes made during a run are picked up by one follow-up run.
        rerunRequested = true;
        return running;
      }
      running = (async () => {
        do {
          rerunRequested = false;
          await runOnce();
        } while (rerunRequested && get().phase === 'synced');
      })().finally(() => {
        running = null;
      });
      return running;
    },

    reset: () => {
      rerunRequested = false;
      set(INITIAL);
    },
  };
});

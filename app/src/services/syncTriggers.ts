import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';

/** Treat "unknown" reachability as online; only an explicit `false` means offline. */
export function isOnline(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Start automatic sync: on sign-in, when connectivity comes back, and when the
 * app returns to the foreground. Returns a function that removes every listener.
 */
export function startSyncTriggers(): () => void {
  const sync = () => void useSyncStore.getState().requestSync();

  const stopNetInfo = NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    const wasOnline = useSyncStore.getState().isOnline;
    useSyncStore.getState().setOnline(online);
    if (online && !wasOnline) {
      sync();
    }
  });

  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      sync();
    }
  });

  const stopAuth = useAuthStore.subscribe((state, previous) => {
    if (state.status === 'signedIn' && previous.status !== 'signedIn') {
      sync();
    }
    if (state.status === 'signedOut' && previous.status === 'signedIn') {
      useSyncStore.getState().reset();
    }
  });

  sync();

  return () => {
    stopNetInfo();
    appState.remove();
    stopAuth();
  };
}

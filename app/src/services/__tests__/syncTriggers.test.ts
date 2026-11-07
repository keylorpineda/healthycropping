import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { isOnline, startSyncTriggers } from '../syncTriggers';

jest.mock('@/stores/sync', () => {
  const { create } = jest.requireActual('zustand');
  return {
    useSyncStore: create(() => ({
      isOnline: true,
      requestSync: jest.fn(() => Promise.resolve()),
      setOnline: jest.fn(),
      reset: jest.fn(),
    })),
  };
});

type NetListener = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void;

describe('sync triggers', () => {
  let netListener: NetListener;
  let appListener: (state: string) => void;
  let stop: () => void;
  const requestSync = () => useSyncStore.getState().requestSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'signedOut', user: null });
    (NetInfo.addEventListener as jest.Mock).mockImplementation((listener: NetListener) => {
      netListener = listener;
      return jest.fn();
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appListener = listener as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    stop = startSyncTriggers();
  });

  afterEach(() => stop());

  it('treats unknown reachability as online', () => {
    expect(isOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('syncs once at start', () => {
    expect(requestSync()).toHaveBeenCalledTimes(1);
  });

  it('syncs on sign-in and resets on sign-out', () => {
    useAuthStore.setState({ status: 'signedIn', user: { uid: 'u1', email: null } });
    expect(requestSync()).toHaveBeenCalledTimes(2);

    useAuthStore.setState({ status: 'signedOut', user: null });
    expect(useSyncStore.getState().reset).toHaveBeenCalled();
  });

  it('syncs when connectivity comes back', () => {
    useSyncStore.setState({ isOnline: false });
    netListener({ isConnected: true, isInternetReachable: true });

    expect(useSyncStore.getState().setOnline).toHaveBeenCalledWith(true);
    expect(requestSync()).toHaveBeenCalledTimes(2);
  });

  it('only records the state when going offline', () => {
    netListener({ isConnected: false, isInternetReachable: false });
    expect(useSyncStore.getState().setOnline).toHaveBeenCalledWith(false);
    expect(requestSync()).toHaveBeenCalledTimes(1);
  });

  it('syncs when the app returns to the foreground', () => {
    appListener('background');
    appListener('active');
    expect(requestSync()).toHaveBeenCalledTimes(2);
  });
});

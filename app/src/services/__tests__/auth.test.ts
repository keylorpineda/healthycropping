import * as firebaseAuth from 'firebase/auth';

import {
  AuthError,
  getIdToken,
  isAuthConfigured,
  readFirebaseConfig,
  resetAuthForTests,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
  toAuthError,
} from '../auth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('firebase/app', () => ({
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
  initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

const mockAuth: { currentUser: { getIdToken: jest.Mock } | null } = { currentUser: null };

jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => mockAuth),
  getReactNativePersistence: jest.fn(() => 'rn-persistence'),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(() => jest.fn()),
}));

const mocked = firebaseAuth as jest.Mocked<typeof firebaseAuth>;

const FULL_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:0:android:0',
};

describe('auth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthForTests(readFirebaseConfig(FULL_ENV));
    mockAuth.currentUser = null;
  });

  afterAll(() => resetAuthForTests());

  describe('readFirebaseConfig', () => {
    it('returns null when a required variable is missing', () => {
      expect(readFirebaseConfig({ ...FULL_ENV, EXPO_PUBLIC_FIREBASE_API_KEY: '' })).toBeNull();
    });

    it('builds the config and keeps optional fields only when present', () => {
      expect(readFirebaseConfig(FULL_ENV)).toEqual({
        apiKey: 'test-api-key',
        authDomain: 'demo.firebaseapp.com',
        projectId: 'demo',
        appId: '1:0:android:0',
      });
      expect(
        readFirebaseConfig({ ...FULL_ENV, EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo.app' }),
      ).toMatchObject({ storageBucket: 'demo.app' });
    });
  });

  describe('toAuthError', () => {
    it.each([
      ['auth/invalid-email', 'invalid-email'],
      ['auth/email-already-in-use', 'email-already-in-use'],
      ['auth/weak-password', 'weak-password'],
      ['auth/wrong-password', 'invalid-credential'],
      ['auth/invalid-credential', 'invalid-credential'],
      ['auth/too-many-requests', 'too-many-requests'],
      ['auth/network-request-failed', 'network'],
      ['auth/something-new', 'unknown'],
    ])('maps %s to %s', (firebaseCode, appCode) => {
      expect(toAuthError({ code: firebaseCode }).code).toBe(appCode);
    });

    it('maps non-Firebase errors to unknown', () => {
      expect(toAuthError(new Error('boom')).code).toBe('unknown');
    });
  });

  it('initializes Auth once with React Native persistence', () => {
    expect(isAuthConfigured()).toBe(true);
    subscribeToAuthChanges(jest.fn());
    subscribeToAuthChanges(jest.fn());
    expect(mocked.initializeAuth).toHaveBeenCalledTimes(1);
    expect(mocked.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: 'rn-persistence',
    });
  });

  it('signs up and signs in with a trimmed email', async () => {
    mocked.createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'u1', email: 'a@b.cr' },
    } as never);
    mocked.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'u1', email: 'a@b.cr' },
    } as never);

    await expect(signUp(' a@b.cr ', 'secret1')).resolves.toEqual({ uid: 'u1', email: 'a@b.cr' });
    await expect(signIn('a@b.cr', 'secret1')).resolves.toEqual({ uid: 'u1', email: 'a@b.cr' });
    expect(mocked.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'a@b.cr',
      'secret1',
    );
  });

  it('rethrows Firebase failures as AuthError', async () => {
    mocked.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/wrong-password' });
    await expect(signIn('a@b.cr', 'bad')).rejects.toMatchObject({ code: 'invalid-credential' });
  });

  it('returns the ID token only when signed in', async () => {
    await expect(getIdToken()).resolves.toBeNull();
    mockAuth.currentUser = { getIdToken: jest.fn().mockResolvedValue('id-token') };
    await expect(getIdToken(true)).resolves.toBe('id-token');
    expect(mockAuth.currentUser.getIdToken).toHaveBeenCalledWith(true);
  });

  describe('when Firebase is not configured', () => {
    beforeEach(() => resetAuthForTests(null));

    it('keeps the app usable offline', async () => {
      const callback = jest.fn();
      expect(isAuthConfigured()).toBe(false);
      subscribeToAuthChanges(callback);
      expect(callback).toHaveBeenCalledWith(null);
      await expect(getIdToken()).resolves.toBeNull();
      await expect(signOut()).resolves.toBeUndefined();
      expect(mocked.initializeAuth).not.toHaveBeenCalled();
    });

    it('rejects sign-in with a not-configured error', async () => {
      await expect(signIn('a@b.cr', 'secret1')).rejects.toEqual(new AuthError('not-configured'));
    });
  });
});

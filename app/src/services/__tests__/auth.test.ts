import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as firebaseAuth from 'firebase/auth';

import {
  AuthError,
  getIdToken,
  isAuthConfigured,
  isGoogleSignInConfigured,
  linkGoogleAccount,
  pendingGoogleLinkEmail,
  readFirebaseConfig,
  readGoogleWebClientId,
  resetAuthForTests,
  signIn,
  signInWithGoogle,
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
  signInWithCredential: jest.fn(),
  linkWithCredential: jest.fn(),
  GoogleAuthProvider: { credential: jest.fn((idToken: string) => ({ idToken })) },
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

    await expect(signUp(' a@b.cr ', 'secret1')).resolves.toEqual({
      uid: 'u1',
      email: 'a@b.cr',
      providers: [],
    });
    await expect(signIn('a@b.cr', 'secret1')).resolves.toEqual({
      uid: 'u1',
      email: 'a@b.cr',
      providers: [],
    });
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

  describe('Google sign-in', () => {
    const WEB_CLIENT_ID = 'web-123.apps.googleusercontent.com';
    const GOOGLE_SUCCESS = {
      type: 'success' as const,
      data: {
        idToken: 'google-id-token',
        user: {
          id: '1',
          email: 'ana@gmail.com',
          name: null,
          photo: null,
          familyName: null,
          givenName: null,
        },
        scopes: [],
        serverAuthCode: null,
      },
    };
    const GOOGLE_FIREBASE_USER = {
      uid: 'u1',
      email: 'ana@gmail.com',
      providerData: [{ providerId: 'google.com' }],
    };

    beforeEach(() => {
      resetAuthForTests(readFirebaseConfig(FULL_ENV), WEB_CLIENT_ID);
    });

    it('validates and trims the Google web client id', () => {
      expect(readGoogleWebClientId('  x.apps.googleusercontent.com ')).toBe(
        'x.apps.googleusercontent.com',
      );
      expect(readGoogleWebClientId(undefined)).toBeNull();
      expect(readGoogleWebClientId('')).toBeNull();
      expect(readGoogleWebClientId('not-a-client-id')).toBeNull();
    });

    it('reports whether Google sign-in is configured', () => {
      expect(isGoogleSignInConfigured()).toBe(true);
      resetAuthForTests(readFirebaseConfig(FULL_ENV), null);
      expect(isGoogleSignInConfigured()).toBe(false);
    });

    it('configures GoogleSignin once and signs in with the Google credential', async () => {
      jest.mocked(GoogleSignin.signIn).mockResolvedValue(GOOGLE_SUCCESS);
      mocked.signInWithCredential.mockResolvedValue({ user: GOOGLE_FIREBASE_USER } as never);

      await expect(signInWithGoogle()).resolves.toEqual({
        uid: 'u1',
        email: 'ana@gmail.com',
        providers: ['google.com'],
      });
      await signInWithGoogle();

      expect(jest.mocked(GoogleSignin.configure)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(GoogleSignin.configure)).toHaveBeenCalledWith({
        webClientId: WEB_CLIENT_ID,
      });
      expect(jest.mocked(firebaseAuth.GoogleAuthProvider.credential)).toHaveBeenCalledWith(
        'google-id-token',
      );
      expect(mocked.signInWithCredential).toHaveBeenCalledWith(mockAuth, {
        idToken: 'google-id-token',
      });
    });

    it('returns null when the picker is cancelled without calling Firebase', async () => {
      jest.mocked(GoogleSignin.signIn).mockResolvedValueOnce({ type: 'cancelled', data: null });

      await expect(signInWithGoogle()).resolves.toBeNull();
      expect(mocked.signInWithCredential).not.toHaveBeenCalled();
    });

    it('rejects when idToken is missing or Google sign-in is not configured', async () => {
      jest.mocked(GoogleSignin.signIn).mockResolvedValueOnce({
        ...GOOGLE_SUCCESS,
        data: { ...GOOGLE_SUCCESS.data, idToken: null },
      });
      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'unknown' });

      resetAuthForTests(readFirebaseConfig(FULL_ENV), null);
      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'not-configured' });
    });

    it('maps Play Services and in-progress native errors', async () => {
      jest
        .mocked(GoogleSignin.hasPlayServices)
        .mockRejectedValueOnce({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'play-services' });

      jest.mocked(GoogleSignin.signIn).mockRejectedValueOnce({ code: 'IN_PROGRESS' });
      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'in-progress' });
    });

    it('stores a pending credential on account-exists and links it on matching password sign-in', async () => {
      jest.mocked(GoogleSignin.signIn).mockResolvedValueOnce(GOOGLE_SUCCESS);
      mocked.signInWithCredential.mockRejectedValueOnce({
        code: 'auth/account-exists-with-different-credential',
      });

      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'account-exists' });
      expect(pendingGoogleLinkEmail()).toBe('ana@gmail.com');

      const passwordUser = {
        uid: 'u1',
        email: 'Ana@gmail.com',
        providerData: [{ providerId: 'password' }],
      };
      const linkedUser = {
        uid: 'u1',
        email: 'Ana@gmail.com',
        providerData: [{ providerId: 'password' }, { providerId: 'google.com' }],
      };
      mocked.signInWithEmailAndPassword.mockResolvedValueOnce({ user: passwordUser } as never);
      mocked.linkWithCredential.mockResolvedValueOnce({ user: linkedUser } as never);

      await expect(signIn('ana@gmail.com', 'secret1')).resolves.toEqual({
        uid: 'u1',
        email: 'Ana@gmail.com',
        providers: ['password', 'google.com'],
      });
      expect(mocked.linkWithCredential).toHaveBeenCalledTimes(1);
      expect(mocked.linkWithCredential).toHaveBeenCalledWith(passwordUser, {
        idToken: 'google-id-token',
      });
      expect(pendingGoogleLinkEmail()).toBeNull();
    });

    it('does not link a pending credential for a different email and ignores link failures', async () => {
      jest.mocked(GoogleSignin.signIn).mockResolvedValue(GOOGLE_SUCCESS);
      mocked.signInWithCredential.mockRejectedValue({
        code: 'auth/account-exists-with-different-credential',
      });

      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'account-exists' });
      mocked.signInWithEmailAndPassword.mockResolvedValueOnce({
        user: { uid: 'u2', email: 'other@gmail.com', providerData: [{ providerId: 'password' }] },
      } as never);

      await expect(signIn('other@gmail.com', 'secret1')).resolves.toEqual({
        uid: 'u2',
        email: 'other@gmail.com',
        providers: ['password'],
      });
      expect(mocked.linkWithCredential).not.toHaveBeenCalled();

      await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'account-exists' });
      mocked.signInWithEmailAndPassword.mockResolvedValueOnce({
        user: { uid: 'u1', email: 'ana@gmail.com', providerData: [{ providerId: 'password' }] },
      } as never);
      mocked.linkWithCredential.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });

      await expect(signIn('ana@gmail.com', 'secret1')).resolves.toEqual({
        uid: 'u1',
        email: 'ana@gmail.com',
        providers: ['password'],
      });
    });

    it('links Google to the current user and maps link errors', async () => {
      await expect(linkGoogleAccount()).rejects.toMatchObject({ code: 'invalid-credential' });

      mockAuth.currentUser = { getIdToken: jest.fn() };
      jest.mocked(GoogleSignin.signIn).mockResolvedValue(GOOGLE_SUCCESS);
      mocked.linkWithCredential.mockResolvedValueOnce({
        user: {
          uid: 'u1',
          email: 'ana@gmail.com',
          providerData: [{ providerId: 'password' }, { providerId: 'google.com' }],
        },
      } as never);

      await expect(linkGoogleAccount()).resolves.toEqual({
        uid: 'u1',
        email: 'ana@gmail.com',
        providers: ['password', 'google.com'],
      });

      mocked.linkWithCredential.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });
      await expect(linkGoogleAccount()).rejects.toMatchObject({ code: 'google-in-use' });
    });

    it('signs out of GoogleSignin only after Google was configured and ignores its failures', async () => {
      await signOut();
      expect(jest.mocked(GoogleSignin.signOut)).not.toHaveBeenCalled();

      jest.mocked(GoogleSignin.signIn).mockResolvedValueOnce(GOOGLE_SUCCESS);
      mocked.signInWithCredential.mockResolvedValueOnce({ user: GOOGLE_FIREBASE_USER } as never);
      await signInWithGoogle();

      jest.mocked(GoogleSignin.signOut).mockRejectedValueOnce(new Error('native-signout-failed'));
      await expect(signOut()).resolves.toBeUndefined();
      expect(jest.mocked(GoogleSignin.signOut)).toHaveBeenCalledTimes(1);
    });
  });
});

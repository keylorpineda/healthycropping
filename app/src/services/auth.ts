import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  type Auth,
  type Persistence,
  type ReactNativeAsyncStorage,
  type User,
  createUserWithEmailAndPassword,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';

/**
 * Firebase Auth (email/password) client.
 *
 * The app only uses Firebase to obtain an ID token for the FastAPI backend.
 * It never talks to Firestore directly (AGENTS.md non-negotiable 6), and every
 * offline flow keeps working when the user is signed out or when Firebase is
 * not configured at all.
 */

export interface AuthUser {
  uid: string;
  email: string | null;
}

export type AuthErrorCode =
  | 'invalid-email'
  | 'email-already-in-use'
  | 'weak-password'
  | 'invalid-credential'
  | 'too-many-requests'
  | 'network'
  | 'not-configured'
  | 'unknown';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

const FIREBASE_ERROR_MAP: Record<string, AuthErrorCode> = {
  'auth/invalid-email': 'invalid-email',
  'auth/missing-email': 'invalid-email',
  'auth/email-already-in-use': 'email-already-in-use',
  'auth/weak-password': 'weak-password',
  'auth/missing-password': 'weak-password',
  'auth/invalid-credential': 'invalid-credential',
  'auth/invalid-login-credentials': 'invalid-credential',
  'auth/user-not-found': 'invalid-credential',
  'auth/wrong-password': 'invalid-credential',
  'auth/user-disabled': 'invalid-credential',
  'auth/too-many-requests': 'too-many-requests',
  'auth/network-request-failed': 'network',
};

/** Map a Firebase SDK error to a stable app-level error code for i18n. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  return new AuthError(FIREBASE_ERROR_MAP[code] ?? 'unknown', code || undefined);
}

/**
 * Expo inlines `EXPO_PUBLIC_*` values at build time only for literal
 * `process.env.NAME` accesses, so each variable is read explicitly here.
 */
function publicFirebaseEnv(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

/** Read the public Firebase client config from `EXPO_PUBLIC_FIREBASE_*` variables. */
export function readFirebaseConfig(
  env: Record<string, string | undefined> = publicFirebaseEnv(),
): FirebaseClientConfig | null {
  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = env.EXPO_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }
  const config: FirebaseClientConfig = { apiKey, authDomain, projectId, appId };
  if (env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    config.storageBucket = env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  }
  if (env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) {
    config.messagingSenderId = env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  }
  return config;
}

/**
 * `getReactNativePersistence` only ships in the react-native build of
 * `@firebase/auth`; its typings are not reachable with `moduleResolution: node`.
 */
const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: ReactNativeAsyncStorage) => Persistence;
};

let authInstance: Auth | null = null;
/** Test-only config override; `undefined` means "read the build-time env". */
let configOverride: FirebaseClientConfig | null | undefined;

function currentConfig(): FirebaseClientConfig | null {
  return configOverride !== undefined ? configOverride : readFirebaseConfig();
}

/** Lazily initialize Firebase Auth with AsyncStorage-backed session persistence. */
export function getFirebaseAuth(): Auth | null {
  if (authInstance) {
    return authInstance;
  }
  const config = currentConfig();
  if (!config) {
    return null;
  }
  const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  return authInstance;
}

export function isAuthConfigured(): boolean {
  return currentConfig() !== null;
}

function requireAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('not-configured');
  }
  return auth;
}

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, email: user.email };
}

export async function signUp(email: string, password: string): Promise<AuthUser> {
  const auth = requireAuth();
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return toAuthUser(credential.user);
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const auth = requireAuth();
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return toAuthUser(credential.user);
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    throw toAuthError(error);
  }
}

/**
 * Return a fresh Firebase ID token for the signed-in user, or `null` when
 * signed out or not configured. The SDK refreshes expired tokens itself.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

/** Subscribe to sign-in/sign-out changes. Calls back with `null` immediately if not configured. */
export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, (user) => callback(user ? toAuthUser(user) : null));
}

/**
 * Test-only hook: drop the cached Auth instance and optionally pin the client
 * config (Expo inlines `EXPO_PUBLIC_*` at transform time, so tests cannot set
 * them through `process.env`).
 */
export function resetAuthForTests(config?: FirebaseClientConfig | null): void {
  authInstance = null;
  configOverride = config;
}

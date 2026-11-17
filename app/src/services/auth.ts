import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  type Auth,
  type AuthCredential,
  GoogleAuthProvider,
  linkWithCredential,
  type Persistence,
  type ReactNativeAsyncStorage,
  type User,
  createUserWithEmailAndPassword,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';

/**
 * Firebase Auth client: email/password and Google (#40).
 *
 * The app only uses Firebase to obtain an ID token for the FastAPI backend.
 * It never talks to Firestore directly (AGENTS.md non-negotiable 6), and every
 * offline flow keeps working when the user is signed out or when Firebase is
 * not configured at all.
 */

export interface AuthUser {
  uid: string;
  email: string | null;
  /** Firebase provider ids linked to the account, e.g. `password`, `google.com`. */
  providers: string[];
}

export const GOOGLE_PROVIDER_ID = 'google.com';

export type AuthErrorCode =
  | 'invalid-email'
  | 'email-already-in-use'
  | 'weak-password'
  | 'invalid-credential'
  | 'too-many-requests'
  | 'network'
  | 'not-configured'
  | 'account-exists'
  | 'google-in-use'
  | 'play-services'
  | 'in-progress'
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
  'auth/account-exists-with-different-credential': 'account-exists',
  'auth/credential-already-in-use': 'google-in-use',
};

/** Map a Firebase SDK error to a stable app-level error code for i18n. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return new AuthError('play-services', error.code);
    }
    if (error.code === statusCodes.IN_PROGRESS) {
      return new AuthError('in-progress', error.code);
    }
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

/**
 * OAuth "Web application" client id of the Firebase project. Google returns an ID token for
 * this audience, which Firebase accepts; see docs/SETUP_SERVICES_ES.md.
 */
export function readGoogleWebClientId(
  value: string | undefined = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.endsWith('.apps.googleusercontent.com') ? trimmed : null;
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
  return {
    uid: user.uid,
    email: user.email,
    providers: (user.providerData ?? []).map((info) => info.providerId),
  };
}

/** Test-only override for the Google client id; `undefined` reads the build-time env. */
let googleClientIdOverride: string | null | undefined;
let googleConfigured = false;

interface GoogleCredential {
  credential: AuthCredential;
  email: string | null;
}

/**
 * Google credential refused because its email already has a password account (#80). It is
 * linked right after the farmer signs in with that password, so both share one uid and data.
 */
let pendingGoogleCredential: GoogleCredential | null = null;

function googleClientId(): string | null {
  return googleClientIdOverride !== undefined ? googleClientIdOverride : readGoogleWebClientId();
}

export function isGoogleSignInConfigured(): boolean {
  return isAuthConfigured() && googleClientId() !== null;
}

/** The email waiting for a password sign-in to link Google, if any (for the UI hint). */
export function pendingGoogleLinkEmail(): string | null {
  return pendingGoogleCredential?.email ?? null;
}

/** Runs the native Google picker; `null` when the farmer closes it. */
async function requestGoogleCredential(): Promise<GoogleCredential | null> {
  const webClientId = googleClientId();
  if (!webClientId) {
    throw new AuthError('not-configured');
  }
  try {
    if (!googleConfigured) {
      GoogleSignin.configure({ webClientId });
      googleConfigured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      return null;
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new AuthError('unknown', 'missing-google-id-token');
    }
    return {
      credential: GoogleAuthProvider.credential(idToken),
      email: response.data.user.email,
    };
  } catch (error) {
    throw toAuthError(error);
  }
}

/**
 * Signs in with Google; `null` when cancelled. With Firebase's default "one account per
 * email", a Google sign-in for an email that already has a password account either joins it
 * (verified email) or fails with `account-exists`; the credential is then kept and linked by
 * the next `signIn` with that email, so the uid and its synced data never change (#80).
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  const auth = requireAuth();
  const google = await requestGoogleCredential();
  if (!google) {
    return null;
  }
  try {
    const result = await signInWithCredential(auth, google.credential);
    pendingGoogleCredential = null;
    return toAuthUser(result.user);
  } catch (error) {
    const mapped = toAuthError(error);
    if (mapped.code === 'account-exists') {
      pendingGoogleCredential = google;
    }
    throw mapped;
  }
}

/** Adds Google to the signed-in account (Account screen, #80); `null` when cancelled. */
export async function linkGoogleAccount(): Promise<AuthUser | null> {
  const user = requireAuth().currentUser;
  if (!user) {
    throw new AuthError('invalid-credential');
  }
  const google = await requestGoogleCredential();
  if (!google) {
    return null;
  }
  try {
    const result = await linkWithCredential(user, google.credential);
    return toAuthUser(result.user);
  } catch (error) {
    throw toAuthError(error);
  }
}

async function linkPendingGoogle(user: User): Promise<User> {
  const pending = pendingGoogleCredential;
  pendingGoogleCredential = null;
  const sameEmail =
    pending !== null &&
    pending.email !== null &&
    user.email !== null &&
    pending.email.toLowerCase() === user.email.toLowerCase();
  if (!pending || !sameEmail) return user;
  try {
    return (await linkWithCredential(user, pending.credential)).user;
  } catch {
    // The password sign-in still succeeded; Google can be linked later from Account.
    return user;
  }
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
    return toAuthUser(await linkPendingGoogle(credential.user));
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
  if (googleConfigured) {
    // Lets the next Google sign-in show the account picker again.
    await GoogleSignin.signOut().catch(() => null);
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
export function resetAuthForTests(
  config?: FirebaseClientConfig | null,
  googleWebClientId?: string | null,
): void {
  authInstance = null;
  configOverride = config;
  googleClientIdOverride = googleWebClientId;
  googleConfigured = false;
  pendingGoogleCredential = null;
}

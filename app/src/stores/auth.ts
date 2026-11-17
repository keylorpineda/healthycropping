import { create } from 'zustand';

import {
  type AuthUser,
  linkGoogleAccount,
  signIn as authSignIn,
  signInWithGoogle as authSignInWithGoogle,
  signOut as authSignOut,
  signUp as authSignUp,
  subscribeToAuthChanges,
} from '@/services/auth';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Start listening to Firebase auth changes; returns the unsubscribe function. */
  start: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  /** Resolves `false` when the farmer closes the Google picker. */
  signInWithGoogle: () => Promise<boolean>;
  /** Adds Google to the signed-in account; resolves `false` when cancelled. */
  linkGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

function signedIn(user: AuthUser): Pick<AuthState, 'status' | 'user'> {
  return { status: 'signedIn', user };
}

const SIGNED_OUT: Pick<AuthState, 'status' | 'user'> = { status: 'signedOut', user: null };

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  start: () =>
    subscribeToAuthChanges((user) => {
      set(user ? signedIn(user) : SIGNED_OUT);
    }),

  signIn: async (email, password) => {
    set(signedIn(await authSignIn(email, password)));
  },

  signUp: async (email, password) => {
    set(signedIn(await authSignUp(email, password)));
  },

  signInWithGoogle: async () => {
    const user = await authSignInWithGoogle();
    if (user) set(signedIn(user));
    return user !== null;
  },

  linkGoogle: async () => {
    const user = await linkGoogleAccount();
    if (user) set(signedIn(user));
    return user !== null;
  },

  signOut: async () => {
    await authSignOut();
    set(SIGNED_OUT);
  },
}));

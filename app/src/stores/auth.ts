import { create } from 'zustand';

import {
  type AuthUser,
  signIn as authSignIn,
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

  signOut: async () => {
    await authSignOut();
    set(SIGNED_OUT);
  },
}));

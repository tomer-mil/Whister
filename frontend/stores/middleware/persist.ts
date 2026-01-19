import type { Store } from '@/types/store';

/**
 * Persist Middleware Configuration
 * Handles localStorage persistence for auth tokens and user state
 */

// localStorage implementation for browser environment
export const createLocalStorage = () => ({
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const item = window.localStorage.getItem(name);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: unknown) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Ignore errors (e.g., QuotaExceededError)
    }
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore errors
    }
  },
});

/**
 * Define which state properties to persist
 * Focus on auth tokens and user info
 */
// Track rehydration completion externally
let persistRehydrated = false;

export const persistConfig = {
  name: 'whist-store-v2',
  version: 1,
  storage: createLocalStorage(),
  partialize: (state: Store) => ({
    // Persist tokens and user for automatic refresh
    // Do NOT persist isAuthenticated or isHydrated - they're runtime values
    user: state.user,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
  }),
  onRehydrateStorage: () => (state) => {
    // After rehydrating from storage, set isAuthenticated based on whether we have a token
    console.log('[Persist] onRehydrateStorage called - accessToken present:', !!state?.accessToken, 'user:', state?.user?.email);
    if (state) {
      state.isAuthenticated = !!state.accessToken;
      state.isHydrated = true;
      persistRehydrated = true;
      console.log('[Persist] onRehydrateStorage - set isAuthenticated:', state.isAuthenticated, 'isHydrated: true');
    }
  },
  migrate: (persistedState: any, version: number) => {
    // Migration logic - clear old data on version mismatch
    if (version === 0) {
      console.log('[Persist] Migrating from version 0 - clearing old state');
      return {
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        isHydrated: false,
      };
    }
    // Return persisted state as-is, ensuring required fields exist
    const result = persistedState || {};
    console.log('[Persist] Migrate complete - version:', version, 'hasToken:', !!result.accessToken);
    return result;
  },
};

export const isPersistRehydrated = () => persistRehydrated;

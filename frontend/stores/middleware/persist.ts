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
export const persistConfig = {
  name: 'whist-store-v2',
  version: 1,
  storage: createLocalStorage(),
  partialize: (state: Store) => ({
    // Persist tokens for automatic refresh, but NOT isAuthenticated
    // isAuthenticated will be recalculated based on token validity
    user: state.user,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    // Do NOT persist isAuthenticated - let it be recalculated
  }),
  onRehydrateStorage: () => (state) => {
    // After rehydrating from storage, always start with isAuthenticated=false
    // It will be set to true only when user successfully logs in
    state.isAuthenticated = false;
  },
  migrate: (persistedState: any, version: number) => {
    // Migration logic - clear old data on version mismatch
    if (version === 0) {
      return {
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      };
    }
    return persistedState;
  },
};

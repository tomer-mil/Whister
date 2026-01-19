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
  name: 'whist-store',
  storage: createLocalStorage(),
  partialize: (state: Store) => ({
    user: state.user,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    isAuthenticated: state.isAuthenticated,
  }),
};

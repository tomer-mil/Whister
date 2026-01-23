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
  onRehydrateStorage: () => (rehydratedState, error) => {
    // This callback is called AFTER rehydration completes
    if (error) {
      console.error('[Persist] Rehydration error:', error);
      persistRehydrated = true;
      return;
    }

    console.log('[Persist] Rehydration complete - accessToken present:', !!rehydratedState?.accessToken, 'user:', rehydratedState?.user?.email);
    persistRehydrated = true;

    // Restore cookie for middleware (middleware runs server-side and can only read cookies)
    if (typeof window !== 'undefined' && rehydratedState?.accessToken) {
      document.cookie = `accessToken=${rehydratedState.accessToken}; path=/; max-age=86400`;
      console.log('[Persist] Restored accessToken cookie for middleware');
    }

    // Use setTimeout to ensure we're outside the middleware chain before updating
    // Import store dynamically to avoid circular dependency
    setTimeout(() => {
      import('../index').then(({ useStore }) => {
        const isAuth = !!rehydratedState?.accessToken;
        console.log('[Persist] Setting isHydrated=true, isAuthenticated=', isAuth);
        useStore.setState({
          isHydrated: true,
          isAuthenticated: isAuth
        });
      });
    }, 0);
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

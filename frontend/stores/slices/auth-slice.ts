/* eslint-disable @typescript-eslint/no-explicit-any */
import { authApi } from '@/lib/api/auth';
import type { AuthState, AuthActions } from '@/types/store';

export interface AuthSlice extends AuthState, AuthActions {}

const initialAuthState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
};


export const createAuthSlice: any = (set: any, get: any) => ({
  ...initialAuthState,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login({ email, password });

      // Transform snake_case API response to camelCase for frontend User type
      const user = {
        id: response.user.id,
        username: response.user.username,
        email: response.user.email,
        displayName: response.user.display_name || '',
        avatarUrl: response.user.avatar_url ?? undefined,
      };

      const newState = {
        user,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        isAuthenticated: true,
        isLoading: false,
        isHydrated: true,
      };

      console.log('[Auth] login - setting state:', { isAuthenticated: true, userEmail: user.email, hasAccessToken: !!response.tokens.access_token });
      set(newState);

      // Store tokens in localStorage and cookies
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', response.tokens.access_token);
        localStorage.setItem('refreshToken', response.tokens.refresh_token);
        console.log('[Auth] login - stored tokens in localStorage');

        // Also set cookies for middleware to read (middleware checks for accessToken cookie)
        document.cookie = `accessToken=${response.tokens.access_token}; path=/; max-age=${response.tokens.expires_in}`;
        document.cookie = `refreshToken=${response.tokens.refresh_token}; path=/`;
        console.log('[Auth] login - set cookies');
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email: string, password: string, displayName: string, username: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.register({
        username,
        email,
        password,
        display_name: displayName,
      });

      // RegisterResponse has user fields at root level, not nested under 'user'
      const user = {
        id: response.id,
        username: response.username,
        email: response.email,
        displayName: response.display_name || '',
        avatarUrl: null,
      };

      set({
        user,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        isAuthenticated: true,
        isLoading: false,
        isHydrated: true,
      });

      // Store tokens in localStorage and cookies
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', response.tokens.access_token);
        localStorage.setItem('refreshToken', response.tokens.refresh_token);

        // Also set cookies for middleware to read
        document.cookie = `accessToken=${response.tokens.access_token}; path=/; max-age=${response.tokens.expires_in}`;
        document.cookie = `refreshToken=${response.tokens.refresh_token}; path=/`;
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // Clear cookies as well
    if (typeof window !== 'undefined') {
      document.cookie = 'accessToken=; path=/; max-age=0';
      document.cookie = 'refreshToken=; path=/; max-age=0';
    }

    // Reset state but keep isHydrated true (hydration already happened)
    set({
      ...initialAuthState,
      isHydrated: true,
    });
  },

  refreshAuth: async () => {
    const refreshToken =
      get().refreshToken || localStorage.getItem('refreshToken');
    if (!refreshToken) {
      get().logout();
      return;
    }

    try {
      const response = await authApi.refreshToken(refreshToken);

      const newState = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || refreshToken,
        isHydrated: true,
        isAuthenticated: true,
      };

      set(newState);

      // Update localStorage as well
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', response.access_token);
        if (response.refresh_token) {
          localStorage.setItem('refreshToken', response.refresh_token);
        }
        console.log('[Auth] Token refresh successful - updated both Zustand and localStorage');
      }
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      get().logout();
    }
  },

  setUser: (user) => set({ user, isAuthenticated: true }),
});

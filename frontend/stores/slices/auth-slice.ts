/* eslint-disable @typescript-eslint/no-explicit-any */
import { authApi } from '@/lib/api/auth';
import type { AuthState, AuthActions } from '@/types/store';

export interface AuthSlice extends AuthState, AuthActions {}

/**
 * Mirror the tokens into cookies.
 *
 * This is not optional bookkeeping: the API proxy at app/api/v1/[...path] builds
 * its Authorization header *only* from the accessToken cookie, and middleware
 * reads the same cookie to gate protected routes. Any code path that produces a
 * new access token and skips this leaves the socket happily connected while
 * every REST call 401s -- which is exactly what refreshAuth used to do.
 */
function persistAuthCookies(accessToken: string, refreshToken: string | undefined, expiresIn: number) {
  if (typeof window === 'undefined') return;
  document.cookie = `accessToken=${accessToken}; path=/; max-age=${expiresIn}`;
  if (refreshToken) {
    document.cookie = `refreshToken=${refreshToken}; path=/`;
  }
}

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
      }

      persistAuthCookies(
        response.tokens.access_token,
        response.tokens.refresh_token,
        response.tokens.expires_in,
      );
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
      }

      persistAuthCookies(
        response.tokens.access_token,
        response.tokens.refresh_token,
        response.tokens.expires_in,
      );
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
      }

      persistAuthCookies(
        response.access_token,
        response.refresh_token,
        response.expires_in,
      );
      console.log('[Auth] Token refresh successful - updated Zustand, localStorage and cookies');
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      get().logout();
    }
  },

  setUser: (user) => set({ user, isAuthenticated: true }),
});

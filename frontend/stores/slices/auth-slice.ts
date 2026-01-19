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
};


export const createAuthSlice: any = (set: any, get: any) => ({
  ...initialAuthState,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login({ email, password });

      const user = {
        id: response.user.id,
        username: response.user.username,
        email: response.user.email,
        displayName: (response.user as any).display_name || '',
        avatarUrl: (response.user as any).avatar_url,
      };

      const newState = {
        user,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        isAuthenticated: true,
        isLoading: false,
      };

      set(newState);

      // Store tokens in localStorage and cookies
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', response.tokens.access_token);
        localStorage.setItem('refreshToken', response.tokens.refresh_token);

        // Also set cookies for middleware to read (middleware checks for accessToken cookie)
        document.cookie = `accessToken=${response.tokens.access_token}; path=/; max-age=${response.tokens.expires_in}`;
        document.cookie = `refreshToken=${response.tokens.refresh_token}; path=/`;
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

      const user = {
        id: response.user.id,
        username: response.user.username,
        email: response.user.email,
        displayName: (response.user as any).display_name || '',
        avatarUrl: (response.user as any).avatar_url,
      };

      set({
        user,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        isAuthenticated: true,
        isLoading: false,
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

    set(initialAuthState);
  },

  refreshAuth: async () => {
    const refreshToken =
      get().refreshToken || localStorage.getItem('refreshToken');
    if (!refreshToken) {
      get().logout();
      return;
    }

    try {
      // TODO: Implement API call to /auth/refresh
      // const response = await apiClient.post('/auth/refresh', {
      //   refresh_token: refreshToken,
      // });
      // const { access_token, refresh_token: newRefreshToken } = response.data;

      // For now, mock implementation
      const newAccessToken = 'access-token-mock-' + Date.now();
      const newRefreshToken = 'refresh-token-mock-' + Date.now();

      set({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });

      localStorage.setItem('accessToken', newAccessToken);
      localStorage.setItem('refreshToken', newRefreshToken);
    } catch {
      get().logout();
    }
  },

  setUser: (user) => set({ user, isAuthenticated: true }),
});

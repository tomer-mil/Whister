/* eslint-disable @typescript-eslint/no-explicit-any */
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

  login: async (email) => {
    set({ isLoading: true });
    try {
      // TODO: Implement API call to /auth/login
      // const response = await apiClient.post('/auth/login', { email, password });
      // const { user, access_token, refresh_token } = response.data;

      // For now, mock implementation
      const mockUser = {
        id: 'user-123',
        displayName: 'User Name',
        email,
        avatarUrl: undefined,
      };

      set({
        user: mockUser,
        accessToken: 'access-token-mock',
        refreshToken: 'refresh-token-mock',
        isAuthenticated: true,
        isLoading: false,
      });

      // Store tokens
      localStorage.setItem('accessToken', 'access-token-mock');
      localStorage.setItem('refreshToken', 'refresh-token-mock');
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email, displayName) => {
    set({ isLoading: true });
    try {
      // TODO: Implement API call to /auth/register
      // const response = await apiClient.post('/auth/register', {
      //   email,
      //   password,
      //   display_name: displayName,
      // });
      // const { user, access_token, refresh_token } = response.data;

      // For now, mock implementation
      const mockUser = {
        id: 'user-' + Math.random().toString(36).substr(2, 9),
        displayName,
        email,
        avatarUrl: undefined,
      };

      set({
        user: mockUser,
        accessToken: 'access-token-mock',
        refreshToken: 'refresh-token-mock',
        isAuthenticated: true,
        isLoading: false,
      });

      localStorage.setItem('accessToken', 'access-token-mock');
      localStorage.setItem('refreshToken', 'refresh-token-mock');
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
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

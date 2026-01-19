/**
 * useAuth Hook
 * Manages authentication actions and integrates with Zustand auth slice
 */

import { useCallback } from 'react';
import { useStore } from '@/stores';
import { authApi } from '@/lib/api';
import type { LoginFormData, RegisterFormData } from '@/lib/validation/schemas';

export interface UseAuthReturn {
  login: (data: LoginFormData) => Promise<void>;
  register: (data: RegisterFormData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: any;
}

/**
 * Hook for authentication operations
 */
export function useAuth(): UseAuthReturn {
  const {
    login: storeLogin,
    register: storeRegister,
    logout: storeLogout,
    isLoading,
    isAuthenticated,
    user,
  } = useStore((state) => ({
    login: state.login,
    register: state.register,
    logout: state.logout,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    user: state.user,
  }));

  /**
   * Login with email and password
   */
  const login = useCallback(
    async (data: LoginFormData) => {
      try {
        const response = await authApi.login({
          email: data.email,
          password: data.password,
        });

        // Store tokens
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', response.access_token);
          localStorage.setItem('refreshToken', response.refresh_token);
        }

        // Update store
        await storeLogin(data.email, data.password);
      } catch (error) {
        throw error;
      }
    },
    [storeLogin]
  );

  /**
   * Register with email, password, and display name
   */
  const register = useCallback(
    async (data: RegisterFormData) => {
      try {
        const response = await authApi.register({
          email: data.email,
          password: data.password,
          display_name: data.displayName,
        });

        // Store tokens
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', response.access_token);
          localStorage.setItem('refreshToken', response.refresh_token);
        }

        // Update store
        await storeRegister(data.email, data.password, data.displayName);
      } catch (error) {
        throw error;
      }
    },
    [storeRegister]
  );

  /**
   * Logout and clear auth state
   */
  const logout = useCallback(() => {
    // Call API to logout (optional, for cleanup on backend)
    authApi.logout().catch((error) => {
      console.error('Error logging out:', error);
    });

    // Clear store
    storeLogout();
  }, [storeLogout]);

  return {
    login,
    register,
    logout,
    isLoading,
    isAuthenticated,
    user,
  };
}

export default useAuth;

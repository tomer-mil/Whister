/**
 * useAuth Hook
 * Manages authentication actions and integrates with Zustand auth slice
 */

import { useCallback } from 'react';
import { useStore } from '@/stores';
import { authApi } from '@/lib/api/auth';
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
        await storeLogin(data.email, data.password);
      } catch (error) {
        throw error;
      }
    },
    [storeLogin]
  );

  /**
   * Register with username, email, password, and display name
   */
  const register = useCallback(
    async (data: RegisterFormData) => {
      try {
        await storeRegister(data.email, data.password, data.displayName, data.username);
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
    authApi.logout().catch(() => {
      // Ignore logout API errors, still clear store
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

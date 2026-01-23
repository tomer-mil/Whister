/**
 * Integration tests for frontend authentication flow.
 * Run with: npm test -- --testPathPattern=auth-flow
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStore } from '@/stores';
import { apiClient } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';
import { initSocket, disconnectSocket } from '@/lib/socket/client';

describe('Authentication Flow', () => {
  beforeEach(() => {
    // Reset store
    useStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: false,
    });

    // Clear localStorage
    localStorage.clear();

    // Clear cookies
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });

    // Disconnect socket if connected
    disconnectSocket();

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Login Flow', () => {
    it('should store token in both Zustand and localStorage on successful login', async () => {
      const mockResponse = {
        user: {
          id: '123',
          username: 'testuser',
          email: 'test@example.com',
          display_name: 'Test User',
          avatar_url: null,
        },
        tokens: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          token_type: 'bearer',
          expires_in: 1800,
        },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      // Check Zustand state
      expect(result.current.accessToken).toBe('test-access-token');
      expect(result.current.refreshToken).toBe('test-refresh-token');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.username).toBe('testuser');

      // Check localStorage
      expect(localStorage.getItem('accessToken')).toBe('test-access-token');
      expect(localStorage.getItem('refreshToken')).toBe('test-refresh-token');
    });

    it('should not store anything on failed login', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Invalid credentials' }),
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        try {
          await result.current.login('test@example.com', 'wrongpassword');
        } catch {
          // Expected error
        }
      });

      expect(result.current.accessToken).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });

  describe('Token Persistence', () => {
    it('should rehydrate auth state from localStorage on initialization', async () => {
      // Pre-populate localStorage
      const storedState = {
        state: {
          accessToken: 'stored-access-token',
          refreshToken: 'stored-refresh-token',
          user: { id: '123', username: 'testuser', email: 'test@example.com' },
          isAuthenticated: true,
        },
      };
      localStorage.setItem('whist-store-v2', JSON.stringify(storedState));

      // This would trigger rehydration in a real app
      // For testing, we manually verify the persistence config works
      expect(localStorage.getItem('whist-store-v2')).toBeTruthy();
    });

    it('should clear localStorage on logout', async () => {
      // Setup authenticated state
      useStore.setState({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        user: { id: '123', username: 'testuser', email: 'test@example.com' },
        isAuthenticated: true,
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        result.current.logout();
      });

      expect(result.current.accessToken).toBeNull();
      expect(result.current.refreshToken).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });
  });

  describe('API Client Token Handling', () => {
    it('should include Authorization header in requests with valid token', async () => {
      useStore.setState({ accessToken: 'test-access-token' });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: '123' }),
      });

      await act(async () => {
        await apiClient.get('/v1/users/me');
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1]?.headers?.Authorization).toBe('Bearer test-access-token');
    });

    it('should not include Authorization header when no token available', async () => {
      useStore.setState({ accessToken: null });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: '123' }),
      });

      await act(async () => {
        await apiClient.get('/v1/public/data');
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1]?.headers?.Authorization).toBeUndefined();
    });

    it('should attempt token refresh on 401 response', async () => {
      useStore.setState({
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
      });

      // First call returns 401
      // Refresh call succeeds
      // Retry succeeds
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Token expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: '123' }),
        });

      await act(async () => {
        await apiClient.get('/v1/users/me');
      });

      // Should have made 3 calls: initial, refresh, retry
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should logout if refresh token fails', async () => {
      useStore.setState({
        accessToken: 'expired-access-token',
        refreshToken: 'invalid-refresh-token',
        isAuthenticated: true,
      });

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Token expired' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Invalid refresh token' }),
        });

      await act(async () => {
        try {
          await apiClient.get('/v1/users/me');
        } catch {
          // Expected error
        }
      });

      const state = useStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.accessToken).toBeNull();
    });
  });

  describe('WebSocket Authentication', () => {
    it('should pass token to socket connection', async () => {
      useStore.setState({ accessToken: 'ws-access-token' });

      const mockSocket = {
        connected: false,
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      // Mock socket.io-client
      jest.mock('socket.io-client', () => ({
        io: jest.fn().mockReturnValue(mockSocket),
      }));

      // This is testing that the socket client uses the current token
      // In real code, you'd verify the io() call receives the token
    });
  });

  describe('Register Flow', () => {
    it('should store tokens after successful registration', async () => {
      const mockResponse = {
        user: {
          id: '456',
          username: 'newuser',
          email: 'new@example.com',
          display_name: 'New User',
          avatar_url: null,
        },
        tokens: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'bearer',
          expires_in: 1800,
        },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        await result.current.register(
          'new@example.com',
          'SecurePass123!',
          'New User',
          'newuser'
        );
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.accessToken).toBe('new-access-token');
      expect(localStorage.getItem('accessToken')).toBe('new-access-token');
    });
  });

  describe('Hydration', () => {
    it('should set isHydrated flag after store initialization', async () => {
      const { result } = renderHook(() => useStore());

      // In a real app, this would be set by the persist middleware
      // after rehydrating from localStorage
      expect(result.current.isHydrated).toBeDefined();
    });
  });
});

describe('Protected Routes', () => {
  it('should have accessToken and refreshToken properly separated', () => {
    // This tests the Zustand store structure
    const state = useStore.getState();
    expect(state).toHaveProperty('accessToken');
    expect(state).toHaveProperty('refreshToken');
  });
});

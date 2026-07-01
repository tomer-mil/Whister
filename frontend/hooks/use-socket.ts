/**
 * useSocket Hook
 * Manages Socket.IO connection lifecycle (read-only)
 *
 * NOTE: This hook NO LONGER handles room joining.
 * Use useRoomJoin hook for explicit room management.
 */

import { useEffect, useState, useCallback } from 'react';
import { socketManager } from '@/lib/socket/manager';
import { useStore } from '@/stores';
import type {
  TypedSocket,
  ClientToServerEvents,
  SocketResponse,
} from '@/types/socket-events';

export interface UseSocketOptions {
  autoConnect?: boolean;
}

export interface UseSocketReturn {
  socket: TypedSocket | null;
  isConnected: boolean;
  emit: <K extends keyof ClientToServerEvents>(
    event: K,
    data: Parameters<ClientToServerEvents[K]>[0]
  ) => Promise<SocketResponse>;
  disconnect: () => void;
}

/**
 * Hook for Socket.IO connection management
 * Read-only - exposes socket and connection state
 * Does NOT handle room joining (use useRoomJoin for that)
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { autoConnect = true } = options;
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Wait for auth hydration
  const isHydrated = useStore((state) => state.isHydrated);
  const accessToken = useStore((state) => state.accessToken);
  const setSocketConnected = useStore((state) => state.setSocketConnected);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    // Wait for auth to hydrate from localStorage
    if (!isHydrated) {
      console.log('[useSocket] Waiting for auth hydration...');
      return;
    }

    // Check for access token
    if (!accessToken) {
      console.warn('[useSocket] No access token found after hydration');
      return;
    }

    console.log('[useSocket] Connecting with token...');

    // Connect via manager
    socketManager.connect(accessToken).then((sock) => {
      setSocket(sock);
      setIsConnected(true);
      setSocketConnected(true);
      console.log('[useSocket] Connected successfully');
    }).catch((error) => {
      setSocketConnected(false);
      console.error('[useSocket] Failed to connect:', error);
    });

    // Set up connection state listeners
    const currentSocket = socketManager.getSocket();
    if (currentSocket) {
      const handleConnect = () => {
        setIsConnected(true);
        setSocket(socketManager.getSocket());
        setSocketConnected(true);
      };
      const handleDisconnect = () => {
        setIsConnected(false);
        setSocketConnected(false);
      };

      currentSocket.on('connect', handleConnect);
      currentSocket.on('disconnect', handleDisconnect);

      return () => {
        currentSocket.off('connect', handleConnect);
        currentSocket.off('disconnect', handleDisconnect);
      };
    }

    return undefined;
  }, [autoConnect, isHydrated, accessToken, setSocketConnected]);

  // A page restored from the browser back/forward cache does not rerun the
  // connection effect above. Reconnect explicitly if its socket was dropped
  // while the page was frozen.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || socketManager.isConnected()) return;

      const token = useStore.getState().accessToken;
      if (!token) return;

      socketManager.connect(token)
        .then((connectedSocket) => {
          setSocket(connectedSocket);
          setIsConnected(true);
          setSocketConnected(true);
        })
        .catch((error: unknown) => {
          setSocketConnected(false);
          console.warn('[useSocket] bfcache reconnect failed:', error);
        });
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [setSocketConnected]);

  // Type-safe event emission
  const emit = useCallback(
    async <K extends keyof ClientToServerEvents>(
      event: K,
      data: Parameters<ClientToServerEvents[K]>[0]
    ): Promise<SocketResponse> => {
      if (!socket) {
        return {
          success: false,
          error: 'Socket not initialized',
        };
      }

      return new Promise((resolve) => {
        socket.emit(event as any, data, (response: SocketResponse) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  // Disconnect socket
  const disconnect = useCallback(() => {
    socketManager.disconnect();
    setSocket(null);
    setIsConnected(false);
    setSocketConnected(false);
  }, [setSocketConnected]);

  return {
    socket,
    isConnected,
    emit,
    disconnect,
  };
}

export default useSocket;

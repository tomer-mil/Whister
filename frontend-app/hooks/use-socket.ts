/**
 * useSocket Hook
 * Manages Socket.IO connection lifecycle and provides typed event emission
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { initSocket, disconnectSocket, isSocketConnected } from '@/lib/socket/client';
import type {
  TypedSocket,
  ClientToServerEvents,
  SocketResponse,
} from '@/types/socket-events';

export interface UseSocketOptions {
  autoConnect?: boolean;
  roomCode?: string;
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
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { autoConnect = true, roomCode } = options;
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<TypedSocket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    // Get access token
    const accessToken =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    if (!accessToken) {
      console.warn('[useSocket] No access token found');
      return;
    }

    try {
      const socketInstance = initSocket({ accessToken });
      socketRef.current = socketInstance;
      setSocket(socketInstance);

      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

      socketInstance.on('connect', handleConnect);
      socketInstance.on('disconnect', handleDisconnect);

      // If already connected, set state
      if (isSocketConnected()) {
        setIsConnected(true);
      }

      return () => {
        socketInstance.off('connect', handleConnect);
        socketInstance.off('disconnect', handleDisconnect);
      };
    } catch (error) {
      console.error('[useSocket] Failed to initialize socket:', error);
      return undefined;
    }
  }, [autoConnect]);

  // Join room if roomCode provided
  useEffect(() => {
    if (!socket || !roomCode || !isConnected) {
      return;
    }

    const joinRoom = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          socket.emit('room:join', { room_code: roomCode }, (response) => {
            if (response.success) {
              resolve();
            } else {
              reject(new Error(response.error || 'Failed to join room'));
            }
          });
        });
      } catch (error) {
        console.error('[useSocket] Failed to join room:', error);
      }
    };

    joinRoom();

    // Cleanup: Leave room on unmount
    return () => {
      try {
        socket.emit('room:leave', { room_code: roomCode }, (response) => {
          if (!response.success) {
            console.error('[useSocket] Failed to leave room:', response.error);
          }
        });
      } catch (error) {
        console.error('[useSocket] Error leaving room:', error);
      }
    };
  }, [socket, roomCode, isConnected]);

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
    if (socket) {
      disconnectSocket();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  return {
    socket,
    isConnected,
    emit,
    disconnect,
  };
}

export default useSocket;

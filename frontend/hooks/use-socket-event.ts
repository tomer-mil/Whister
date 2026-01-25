/**
 * useSocketEvent Hook
 * Type-safe Socket.IO event listener with automatic cleanup
 */

import { useEffect, useRef, useState } from 'react';
import { socketManager } from '@/lib/socket/manager';
import type { ServerToClientEvents, TypedSocket } from '@/types/socket-events';

/**
 * Hook for subscribing to Socket.IO server events
 * Automatically handles cleanup on unmount
 *
 * Uses a ref pattern to always call the latest handler without re-subscribing
 */
export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
): void {
  const handlerRef = useRef(handler);
  const [socket, setSocket] = useState<TypedSocket | null>(null);

  // Update handler ref when handler changes (avoids stale closures)
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // Poll for socket availability
  useEffect(() => {
    const checkSocket = () => {
      const sock = socketManager.getSocket();
      if (sock && sock.connected) {
        setSocket(sock);
      }
    };

    // Check immediately
    checkSocket();

    // Poll every 100ms until socket is available
    const interval = setInterval(checkSocket, 100);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to socket event once socket is available
  useEffect(() => {
    if (!socket) {
      return;
    }

    // Wrap handler with ref to always use latest handler
    const wrappedHandler = (...args: any[]) => {
      (handlerRef.current as any)(...args);
    };

    socket.on(event as any, wrappedHandler);

    // Cleanup: Remove listener on unmount or when event changes
    return () => {
      socket?.off(event as any, wrappedHandler);
    };
  }, [event, socket]);
}

export default useSocketEvent;

/**
 * useSocketEvent Hook
 * Type-safe Socket.IO event listener with automatic cleanup
 */

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket/client';
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

  // Update handler ref when handler changes (avoids stale closures)
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // Subscribe to socket event - only re-subscribes when event name changes
  useEffect(() => {
    let socket: TypedSocket | null = null;

    try {
      socket = getSocket();
    } catch {
      console.warn(`[useSocketEvent] Socket not initialized for event "${String(event)}"`);
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
  }, [event]);
}

export default useSocketEvent;

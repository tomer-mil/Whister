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
 */
export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K],
  deps?: React.DependencyList
): void {
  const depsArray = deps || [];
  const handlerRef = useRef(handler);

  // Update handler ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // Subscribe to socket event
  useEffect(() => {
    let socket: TypedSocket | null = null;

    try {
      socket = getSocket();
    } catch {
      console.warn(`[useSocketEvent] Socket not initialized for event "${String(event)}"`);
      return;
    }

    // Wrap handler with ref to avoid stale closures
    const wrappedHandler = (...args: any[]) => {
      (handlerRef.current as any)(...args);
    };

    socket.on(event as any, wrappedHandler);

    // Cleanup: Remove listener on unmount
    return () => {
      socket?.off(event as any, wrappedHandler);
    };
  }, [event, depsArray]);
}

export default useSocketEvent;

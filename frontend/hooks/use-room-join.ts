/**
 * useRoomJoin Hook
 * Provides explicit room join/leave API using WebSocket Manager
 *
 * Use this hook to JOIN/LEAVE rooms explicitly.
 * Do NOT use useSocket for room management.
 */

import { useCallback, useState } from 'react';
import { socketManager } from '@/lib/socket/manager';
import { useStore } from '@/stores';

export interface UseRoomJoinReturn {
  joinRoom: (roomCode: string, displayName: string) => Promise<void>;
  leaveRoom: (roomCode?: string) => Promise<void>;
  isJoined: boolean;
  isJoining: boolean;
  joinError: string | null;
}

/**
 * Hook for explicit room joining/leaving
 */
export function useRoomJoin(): UseRoomJoinReturn {
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const currentRoomCode = useStore((state) => state.currentRoomCode);
  const roomJoinStatus = useStore((state) => state.roomJoinStatus);

  const joinRoom = useCallback(async (roomCode: string, displayName: string) => {
    // Already in this room
    if (socketManager.isInRoom(roomCode)) {
      console.log('[useRoomJoin] Already in room:', roomCode);
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      console.log('[useRoomJoin] Joining room:', roomCode);
      const result = await socketManager.joinRoom(roomCode, displayName);
      console.log('[useRoomJoin] Join successful:', result);

      // Update Zustand store
      useStore.getState().setCurrentRoomCode(roomCode);
      useStore.getState().setRoomJoinStatus('joined');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to join room';
      console.error('[useRoomJoin] Join failed:', errorMessage);
      setJoinError(errorMessage);

      // Update Zustand store
      useStore.getState().setJoinError(errorMessage);
      useStore.getState().setRoomJoinStatus('idle');

      throw error;
    } finally {
      setIsJoining(false);
    }
  }, []);

  const leaveRoom = useCallback(async (roomCode?: string) => {
    try {
      console.log('[useRoomJoin] Leaving room:', roomCode || 'current');
      await socketManager.leaveRoom(roomCode);

      // Update Zustand store
      useStore.getState().setCurrentRoomCode(null);
      useStore.getState().setRoomJoinStatus('idle');
    } catch (error) {
      console.error('[useRoomJoin] Leave failed:', error);
      // Don't throw - leaving should be best-effort
    }
  }, []);

  return {
    joinRoom,
    leaveRoom,
    isJoined: roomJoinStatus === 'joined' || socketManager.getCurrentRoom() !== null,
    isJoining,
    joinError,
  };
}

export default useRoomJoin;

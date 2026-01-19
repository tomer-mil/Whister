/**
 * useRoom Hook
 * Manages room state and WebSocket event subscriptions
 */

import { useCallback } from 'react';
import { useStore } from '@/stores';
import { useSocket } from './use-socket';
import { useSocketEvent } from './use-socket-event';
import type {
  PlayerJoinedPayload,
  PlayerLeftPayload,
  SeatingUpdatedPayload,
} from '@/types/socket-events';

export interface UseRoomOptions {
  roomCode?: string;
}

/**
 * Hook for room management and WebSocket integration
 */
export function useRoom(options: UseRoomOptions = {}) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true, roomCode });

  // Store selectors and actions
  const {
    addPlayer,
    removePlayer,
    updateSeating,
    updatePlayerConnection,
  } = useStore((state) => ({
    addPlayer: state.addPlayer,
    removePlayer: state.removePlayer,
    updateSeating: state.updateSeating,
    updatePlayerConnection: state.updatePlayerConnection,
  }));

  // Handle player joined event
  useSocketEvent(
    'room:player_joined',
    useCallback(
      (payload: PlayerJoinedPayload) => {
        addPlayer({
          userId: payload.user_id,
          displayName: payload.display_name,
          seatPosition: payload.seat_position ?? null,
          isConnected: payload.is_connected,
          isAdmin: false,
        });
      },
      [addPlayer]
    )
  );

  // Handle player left event
  useSocketEvent(
    'room:player_left',
    useCallback(
      (payload: PlayerLeftPayload) => {
        removePlayer(payload.user_id);
      },
      [removePlayer]
    )
  );

  // Handle player connection status change
  useSocketEvent(
    'room:player_connected',
    useCallback(
      (payload) => {
        updatePlayerConnection(payload.user_id, payload.is_connected);
      },
      [updatePlayerConnection]
    )
  );

  useSocketEvent(
    'room:player_disconnected',
    useCallback(
      (payload) => {
        updatePlayerConnection(payload.user_id, payload.is_connected);
      },
      [updatePlayerConnection]
    )
  );

  // Handle seating updated event
  useSocketEvent(
    'room:seating_updated',
    useCallback(
      (payload: SeatingUpdatedPayload) => {
        // Update each player's seating
        Object.entries(payload.positions).forEach(([playerId, position]) => {
          updateSeating(playerId, position);
        });
      },
      [updateSeating]
    )
  );

  return {
    socket,
    emit,
  };
}

export default useRoom;

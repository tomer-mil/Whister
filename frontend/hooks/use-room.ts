/**
 * useRoom Hook
 * Manages room state and WebSocket event subscriptions
 */

import { useCallback } from 'react';
import { useStore } from '@/stores';
import { useSocket } from './use-socket';
import { useSocketEvent } from './use-socket-event';
import type {
  RoomJoinedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
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
    setRoomData,
    addPlayer,
    removePlayer,
    updatePlayerConnection,
  } = useStore((state) => ({
    setRoomData: state.setRoomData,
    addPlayer: state.addPlayer,
    removePlayer: state.removePlayer,
    updatePlayerConnection: state.updatePlayerConnection,
  }));

  // Handle room joined event - sets initial room state
  useSocketEvent(
    'room:joined',
    useCallback(
      (payload: RoomJoinedPayload) => {
        console.log('[useRoom] Received room:joined', payload);
        setRoomData({
          roomCode: payload.room_code,
          roomId: payload.game_id,
          isAdmin: payload.is_admin,
          players: payload.players.map((p) => ({
            userId: p.user_id,
            displayName: p.display_name,
            seatPosition: p.seat_position,
            isConnected: p.is_connected,
            isAdmin: p.is_admin,
          })),
        });
      },
      [setRoomData]
    )
  );

  // Handle player joined event
  useSocketEvent(
    'room:player_joined',
    useCallback(
      (payload: PlayerJoinedPayload) => {
        console.log('[useRoom] Received room:player_joined', payload);
        addPlayer({
          userId: payload.player.user_id,
          displayName: payload.player.display_name,
          seatPosition: payload.player.seat_position ?? null,
          isConnected: payload.player.is_connected,
          isAdmin: payload.player.is_admin,
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
        console.log('[useRoom] Received room:player_left', payload);
        removePlayer(payload.player_id);
      },
      [removePlayer]
    )
  );

  // Handle player disconnected event - player temporarily disconnected
  useSocketEvent(
    'room:player_disconnected',
    useCallback(
      (payload: PlayerDisconnectedPayload) => {
        console.log('[useRoom] Received room:player_disconnected', payload);
        updatePlayerConnection(payload.player_id, false);
      },
      [updatePlayerConnection]
    )
  );

  // Handle player reconnected event - player came back online
  useSocketEvent(
    'room:player_reconnected',
    useCallback(
      (payload: PlayerReconnectedPayload) => {
        console.log('[useRoom] Received room:player_reconnected', payload);
        updatePlayerConnection(payload.player_id, true);
      },
      [updatePlayerConnection]
    )
  );

  return {
    socket,
    emit,
  };
}

export default useRoom;

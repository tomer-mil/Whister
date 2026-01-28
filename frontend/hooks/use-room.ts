/**
 * useRoom Hook
 * Manages room state and WebSocket event subscriptions
 *
 * NOTE: This hook NO LONGER handles joining rooms.
 * It only subscribes to room events.
 * Use useRoomJoin to explicitly join/leave rooms.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/stores';
import { socketManager } from '@/lib/socket/manager';
import { useSocketEvent } from './use-socket-event';
import type {
  TypedSocket,
  ClientToServerEvents,
  SocketResponse,
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
 * Hook for room event subscriptions
 * Does NOT handle joining - use useRoomJoin for that
 */
export function useRoom(_options: UseRoomOptions = {}) {
  const [socket, setSocket] = useState<TypedSocket | null>(null);

  // Get socket from manager and listen for connection changes
  useEffect(() => {
    const updateSocket = () => {
      const sock = socketManager.getSocket();
      setSocket(sock);
    };

    // Initial check
    updateSocket();

    // Listen for connection events
    const sock = socketManager.getSocket();
    if (sock) {
      sock.on('connect', updateSocket);
      sock.on('disconnect', updateSocket);

      return () => {
        sock.off('connect', updateSocket);
        sock.off('disconnect', updateSocket);
      };
    }

    return undefined;
  }, []);

  // Type-safe emit function
  const emit = useCallback(
    async <K extends keyof ClientToServerEvents>(
      event: K,
      data: Parameters<ClientToServerEvents[K]>[0]
    ): Promise<SocketResponse> => {
      const sock = socketManager.getSocket();
      if (!sock) {
        return {
          success: false,
          error: 'Socket not connected',
        };
      }

      return new Promise((resolve) => {
        sock.emit(event as any, data, (response: SocketResponse) => {
          resolve(response);
        });
      });
    },
    []
  );

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

        // Verify currentRoomCode was set
        const currentRoomCode = useStore.getState().currentRoomCode;
        console.log('[useRoom] After setRoomData, currentRoomCode:', currentRoomCode);
        console.log('[useRoom] Players in payload:', payload.players.length, payload.players);
        console.log('[useRoom] Players in store:', useStore.getState().players);

        // If game is in progress (trump_bidding, contract_bidding, playing), populate game players
        if (payload.phase && ['trump_bidding', 'contract_bidding', 'playing', 'frisch'].includes(payload.phase)) {
          const store = useStore.getState();
          store.setGameState({
            gameId: payload.game_id,
            currentRound: payload.current_round ?? 1,
            gamePlayers: payload.players.map((p) => ({
              userId: p.user_id,
              displayName: p.display_name,
              seatPosition: p.seat_position,
              contractBid: null,
              tricksWon: 0,
              score: null,
              isConnected: p.is_connected,
            })),
          });

          // Set the bidding phase
          if (payload.phase === 'trump_bidding' || payload.phase === 'frisch') {
            store.setPhase(payload.phase as any);
          }
        }
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

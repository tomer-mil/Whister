/**
 * Game Layout
 * Maintains WebSocket connection for game pages
 *
 * Handles:
 * - Socket connection (re-establishes after page reload)
 * - Room joining (re-joins room when roomCode is available)
 * - Listening for room:game_starting to handle new round transitions
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { useSocket } from '@/hooks/use-socket';
import { useRoom } from '@/hooks/use-room';
import { useRoomJoin } from '@/hooks/use-room-join';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { socketManager } from '@/lib/socket/manager';
import type { GameStartingPayload } from '@/types/socket-events';

type Props = {
  children: React.ReactNode;
  params: Promise<{ gameId: string }>;
};

export default function GameLayout({ children, params }: Props) {
  const router = useRouter();
  const [gameId, setGameId] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => setGameId(p.gameId));
  }, [params]);

  // Establish socket connection (needed after full page reload)
  const { isConnected } = useSocket({ autoConnect: true });

  // Get room code and user info from store
  const roomCode = useStore((state) => state.roomCode);
  const displayName = useStore((state) => state.user?.displayName || 'Player');

  // Get join function for proper room joining (after page reload)
  const { joinRoom } = useRoomJoin();

  // Subscribe to room events
  useRoom({ roomCode: roomCode ?? undefined });

  // Fetch game state when already in room (e.g., navigated from RoomLayout)
  // This is the original behavior - emit room:join to get fresh game state
  React.useEffect(() => {
    if (!roomCode) return;

    const socket = socketManager.getSocket();
    if (!socket || !socket.connected) {
      console.warn('[GameLayout] Socket not connected, cannot fetch game state');
      return;
    }

    // Emit room:join to get fresh game state (bypasses isInRoom guard)
    console.log('[GameLayout] Fetching game state for room:', roomCode);
    socket.emit('room:join', {
      room_code: roomCode,
      display_name: displayName,
    });
  }, [roomCode, displayName]);

  // After page reload: socket reconnects via useSocket, then we need to
  // properly join the room once the connection is established
  React.useEffect(() => {
    if (!roomCode || !isConnected) return;

    // Only do a proper join if not already in the room
    // (e.g., after full page reload where socketManager.currentRoom was lost)
    if (!socketManager.isInRoom(roomCode)) {
      console.log('[GameLayout] Reconnecting to room after page reload:', roomCode);
      joinRoom(roomCode, displayName)
        .then(() => {
          console.log('[GameLayout] Successfully rejoined room');
        })
        .catch((error) => {
          console.error('[GameLayout] Failed to rejoin room:', error);
        });
    }
  }, [roomCode, isConnected, joinRoom, displayName]);

  // Listen for room:game_starting to handle new round transitions
  // When a new round starts, refresh game state and navigate to game page
  useSocketEvent(
    'room:game_starting',
    React.useCallback(
      (payload: GameStartingPayload) => {
        console.log('[GameLayout] Received room:game_starting', payload);

        // Reset bidding state for new round
        const store = useStore.getState();
        store.resetBidding();

        // Re-join room to get fresh game state (new round data)
        const socket = socketManager.getSocket();
        if (socket?.connected && roomCode) {
          socket.emit('room:join', {
            room_code: roomCode,
            display_name: displayName,
          });
        }

        // Navigate to game page (from scores page or refresh current game page)
        router.push(`/game/${payload.game_id}`);
      },
      [roomCode, displayName, router]
    )
  );

  if (!gameId) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Game Layout
 * Maintains WebSocket connection for game pages
 *
 * NOTE: Does NOT join room - user should already be joined from room layout
 * Only subscribes to game events
 */

'use client';

import React from 'react';
import { useStore } from '@/stores';
import { useRoom } from '@/hooks/use-room';
import { useRoomJoin } from '@/hooks/use-room-join';
import { socketManager } from '@/lib/socket/manager';

type Props = {
  children: React.ReactNode;
  params: Promise<{ gameId: string }>;
};

export default function GameLayout({ children, params }: Props) {
  const [gameId, setGameId] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => setGameId(p.gameId));
  }, [params]);

  // Get room code and user info from store
  const roomCode = useStore((state) => state.roomCode);
  const displayName = useStore((state) => state.user?.displayName || 'Player');

  // Subscribe to room events
  useRoom({ roomCode: roomCode ?? undefined });

  // Get room join function
  const { joinRoom } = useRoomJoin();

  // Re-join room when game page loads to get fresh game state
  // This triggers a room:joined event with current game state (phase, players, etc.)
  React.useEffect(() => {
    if (!roomCode) return;

    // Check if we're in the room
    if (socketManager.isInRoom(roomCode)) {
      console.log('[GameLayout] Re-joining room to fetch game state:', roomCode);
      // Re-join to get updated game state
      joinRoom(roomCode, displayName).catch((error) => {
        console.error('[GameLayout] Failed to re-join room:', error);
      });
    } else {
      console.warn('[GameLayout] Not in room:', roomCode, '- joining now');
      joinRoom(roomCode, displayName).catch((error) => {
        console.error('[GameLayout] Failed to join room:', error);
      });
    }
  }, [roomCode, joinRoom, displayName]);

  if (!gameId) {
    return null;
  }

  return <>{children}</>;
}

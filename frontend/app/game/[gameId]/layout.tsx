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

  // Fetch game state by emitting room:join directly (bypasses guard)
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

  if (!gameId) {
    return null;
  }

  return <>{children}</>;
}

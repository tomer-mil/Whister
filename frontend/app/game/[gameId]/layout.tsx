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

  // Get room code from store (set when game started)
  const roomCode = useStore((state) => state.roomCode);

  // Subscribe to room events ONLY (doesn't join - already joined)
  useRoom({ roomCode: roomCode ?? undefined });

  // Verify we're in the correct room (defensive check)
  React.useEffect(() => {
    if (roomCode && !socketManager.isInRoom(roomCode)) {
      console.warn('[GameLayout] Not in room:', roomCode, '- user may have navigated directly');
      // Could redirect to room page here, but let's just log for now
    }
  }, [roomCode]);

  if (!gameId) {
    return null;
  }

  return <>{children}</>;
}

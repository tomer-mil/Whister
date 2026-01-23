/**
 * Game Layout
 * Maintains WebSocket connection for game pages
 */

'use client';

import React from 'react';
import { useStore } from '@/stores';
import { useSocket } from '@/hooks/use-socket';

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

  // Maintain socket connection for game events
  useSocket({ autoConnect: true, roomCode: roomCode ?? undefined });

  if (!gameId) {
    return null;
  }

  return <>{children}</>;
}

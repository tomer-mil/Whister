/**
 * Room Layout
 * Sets up WebSocket connection and room state for child pages
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/hooks/use-room';
import { useSocketEvent } from '@/hooks/use-socket-event';
import type { GameStartingPayload } from '@/types/socket-events';

type Props = {
  children: React.ReactNode;
  params: Promise<{ roomCode: string }>;
};

export default function RoomLayout({ children, params }: Props) {
  const router = useRouter();

  return (
    <RoomLayoutClient
      params={params}
      onGameStarting={(gameId: string) => router.push(`/game/${gameId}`)}
    >
      {children}
    </RoomLayoutClient>
  );
}

function RoomLayoutClient({
  children,
  params,
  onGameStarting,
}: {
  children: React.ReactNode;
  params: Promise<{ roomCode: string }>;
  onGameStarting: (gameId: string) => void;
}) {
  const [roomCode, setRoomCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  if (!roomCode) {
    return null;
  }

  // Initialize room connection
  useRoom({ roomCode });

  // Handle game started event - redirect to game page
  useSocketEvent('room:game_starting', (payload: GameStartingPayload) => {
    onGameStarting(payload.game_id);
  });

  return <>{children}</>;
}

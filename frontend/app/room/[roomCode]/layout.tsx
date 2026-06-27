/**
 * Room Layout
 * Sets up WebSocket connection and room state for child pages
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { useSocket } from '@/hooks/use-socket';
import { useRoomJoin } from '@/hooks/use-room-join';
import { useRoom } from '@/hooks/use-room';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { socketManager } from '@/lib/socket/manager';
import type { GameStartingPayload, RoomJoinedPayload } from '@/types/socket-events';

type Props = {
  children: React.ReactNode;
  params: Promise<{ roomCode: string }>;
};

export default function RoomLayout({ children, params }: Props) {
  const router = useRouter();

  return (
    <RoomLayoutClient
      params={params}
      onGameStarting={(gameId: string) => router.push(`/game/${gameId}/seating`)}
      onGameResumed={(gameId: string) => router.push(`/game/${gameId}`)}
    >
      {children}
    </RoomLayoutClient>
  );
}

function RoomLayoutClient({
  children,
  params,
  onGameStarting,
  onGameResumed,
}: {
  children: React.ReactNode;
  params: Promise<{ roomCode: string }>;
  onGameStarting: (gameId: string) => void;
  onGameResumed: (gameId: string) => void;
}) {
  const [roomCode, setRoomCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // Initialize socket connection
  const { isConnected } = useSocket({ autoConnect: true });

  // Get join function
  const { joinRoom } = useRoomJoin();
  const displayName = useStore((state) => state.user?.displayName || 'Player');

  // Subscribe to room events (doesn't auto-join)
  useRoom({ roomCode: roomCode ?? undefined });

  // Explicitly join room when roomCode is available AND socket is connected
  // Use socketManager to check if already in room (handles Strict Mode remounts)
  React.useEffect(() => {
    if (!roomCode || !isConnected) {
      return;
    }

    // Check if already in this room (socketManager tracks this globally)
    if (socketManager.isInRoom(roomCode)) {
      console.log('[RoomLayout] Already in room:', roomCode);
      return;
    }

    console.log('[RoomLayout] Joining room:', roomCode);
    joinRoom(roomCode, displayName)
      .then(() => {
        console.log('[RoomLayout] Successfully joined room');
      })
      .catch((error) => {
        console.error('[RoomLayout] Failed to join room:', error);
      });
  }, [roomCode, isConnected, joinRoom, displayName]);

  // Handle game started event - redirect to game page
  useSocketEvent('room:game_starting', (payload: GameStartingPayload) => {
    onGameStarting(payload.game_id);
  });

  useSocketEvent('room:joined', (payload: RoomJoinedPayload) => {
    const activePhases = ['bidding_trump', 'frisch', 'bidding_contract', 'playing', 'round_complete'];
    if (activePhases.includes(payload.phase)) {
      onGameResumed(payload.game_id);
    }
  });

  // Show nothing while loading room code
  if (!roomCode) {
    return null;
  }

  return <>{children}</>;
}

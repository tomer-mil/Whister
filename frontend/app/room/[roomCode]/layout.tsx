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
  const [hasJoined, setHasJoined] = React.useState(false);

  React.useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // Initialize socket connection
  const { isConnected } = useSocket({ autoConnect: true });

  // Get join function and display name
  const { joinRoom, leaveRoom } = useRoomJoin();
  const displayName = useStore((state) => state.user?.displayName || 'Player');

  // Subscribe to room events (doesn't auto-join)
  useRoom({ roomCode: roomCode ?? undefined });

  // Explicitly join room when roomCode is available AND socket is connected
  React.useEffect(() => {
    if (!roomCode || hasJoined || !isConnected) {
      return;
    }

    console.log('[RoomLayout] Joining room:', roomCode);
    joinRoom(roomCode, displayName)
      .then(() => {
        console.log('[RoomLayout] Successfully joined room');
        setHasJoined(true);
      })
      .catch((error) => {
        console.error('[RoomLayout] Failed to join room:', error);
      });

    // Cleanup: Leave room on unmount
    return () => {
      if (hasJoined) {
        console.log('[RoomLayout] Leaving room on unmount:', roomCode);
        leaveRoom(roomCode);
        setHasJoined(false);
      }
    };
  }, [roomCode, hasJoined, isConnected, joinRoom, leaveRoom, displayName]);

  // Handle game started event - redirect to game page
  useSocketEvent('room:game_starting', (payload: GameStartingPayload) => {
    onGameStarting(payload.game_id);
  });

  // Show nothing while loading room code
  if (!roomCode) {
    return null;
  }

  return <>{children}</>;
}

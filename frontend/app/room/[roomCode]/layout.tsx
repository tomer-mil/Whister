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
  const hasJoinedRef = React.useRef(false);
  const roomCodeRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // Track roomCode in ref for cleanup
  React.useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // Initialize socket connection
  const { isConnected } = useSocket({ autoConnect: true });

  // Get join function and display name
  const { joinRoom, leaveRoom } = useRoomJoin();
  const displayName = useStore((state) => state.user?.displayName || 'Player');

  // Subscribe to room events (doesn't auto-join)
  useRoom({ roomCode: roomCode ?? undefined });

  // Explicitly join room when roomCode is available AND socket is connected
  React.useEffect(() => {
    if (!roomCode || hasJoinedRef.current || !isConnected) {
      return;
    }

    console.log('[RoomLayout] Joining room:', roomCode);
    joinRoom(roomCode, displayName)
      .then(() => {
        console.log('[RoomLayout] Successfully joined room');
        hasJoinedRef.current = true;
      })
      .catch((error) => {
        console.error('[RoomLayout] Failed to join room:', error);
      });
  }, [roomCode, isConnected, joinRoom, displayName]);

  // Cleanup: Leave room on unmount only (empty deps = only runs on mount/unmount)
  React.useEffect(() => {
    return () => {
      if (hasJoinedRef.current && roomCodeRef.current) {
        console.log('[RoomLayout] Leaving room on unmount:', roomCodeRef.current);
        leaveRoom(roomCodeRef.current);
        hasJoinedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

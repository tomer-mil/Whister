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

const ACTIVE_PHASES = ['bidding_trump', 'frisch', 'bidding_contract', 'playing', 'round_complete'] as const;

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

  // Keep a ref to the latest onGameResumed so the join effect can call it
  // without taking it as a reactive dependency (avoids re-registering the join
  // effect on every render just because the arrow function identity changed).
  const onGameResumedRef = React.useRef(onGameResumed);
  React.useEffect(() => { onGameResumedRef.current = onGameResumed; }, [onGameResumed]);

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
        // useRoomJoin stores game_id + phase from the join payload before this
        // .then() runs.  Navigate directly here so we don't depend on the
        // useSocketEvent('room:joined') subscription which may miss the event
        // when the server round-trip completes within the 100 ms polling window.
        const { status, gameId } = useStore.getState();
        if (gameId && ACTIVE_PHASES.includes(status as (typeof ACTIVE_PHASES)[number])) {
          console.log('[RoomLayout] Resuming active game from join payload:', gameId, status);
          onGameResumedRef.current(gameId);
        }
      })
      .catch((error) => {
        console.error('[RoomLayout] Failed to join room:', error);
      });
  }, [roomCode, isConnected, joinRoom, displayName]);

  // Handle game started event - redirect to game page
  useSocketEvent('room:game_starting', (payload: GameStartingPayload) => {
    onGameStarting(payload.game_id);
  });

  // Fallback: if useSocketEvent catches room:joined before the join effect's
  // .then() runs (e.g. on a slow machine), still redirect as before.
  useSocketEvent('room:joined', (payload: RoomJoinedPayload) => {
    if (ACTIVE_PHASES.includes(payload.phase as (typeof ACTIVE_PHASES)[number])) {
      onGameResumed(payload.game_id);
    }
  });

  // Show nothing while loading room code
  if (!roomCode) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Seating Selection Page
 * Admin arranges player seating order via drag-and-drop.
 * Non-admin players see the arrangement update in real time.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { socketManager } from '@/lib/socket/manager';
import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/shared/connection-status';
import type { SeatingUpdatedPayload, SeatingSetPayload } from '@/types/socket-events';

// Seat positions around the circular table (clockwise from top)
const SEAT_POSITIONS = [
  { label: '1', angle: 270, x: 50, y: 5 },   // Top (12 o'clock)
  { label: '2', angle: 0, x: 88, y: 50 },     // Right (3 o'clock)
  { label: '3', angle: 90, x: 50, y: 88 },    // Bottom (6 o'clock)
  { label: '4', angle: 180, x: 12, y: 50 },   // Left (9 o'clock)
];

export default function SeatingPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = React.use(params);
  const router = useRouter();
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { roomCode, players, isAdmin } = useStore((state) => ({
    roomCode: state.roomCode,
    players: state.players,
    isAdmin: state.isAdmin,
  }));

  // Sort players by seat position for rendering
  const sortedPlayers = [...players]
    .filter((p) => p.seatPosition !== null)
    .sort((a, b) => (a.seatPosition ?? 0) - (b.seatPosition ?? 0));

  // Listen for seating updates from server
  useSocketEvent(
    'game:seating_updated',
    useCallback((payload: SeatingUpdatedPayload) => {
      const store = useStore.getState();
      // Update players with new seat positions
      const updatedPlayers = store.players.map((p) => {
        const serverPlayer = payload.players.find((sp) => sp.user_id === p.userId);
        if (serverPlayer) {
          return { ...p, seatPosition: serverPlayer.seat_position };
        }
        return p;
      });
      store.setPlayers(updatedPlayers);
    }, [])
  );

  // Listen for seating confirmed — navigate to game page
  useSocketEvent(
    'game:seating_set',
    useCallback(
      (payload: SeatingSetPayload) => {
        // Update players with final positions
        const store = useStore.getState();
        const updatedPlayers = store.players.map((p) => {
          const serverPlayer = payload.players.find((sp) => sp.user_id === p.userId);
          if (serverPlayer) {
            return { ...p, seatPosition: serverPlayer.seat_position };
          }
          return p;
        });
        store.setPlayers(updatedPlayers);

        // Navigate to game page for bidding
        router.push(`/game/${payload.game_id}`);
      },
      [router]
    )
  );

  // Drag handlers (admin only)
  const handleDragStart = useCallback(
    (playerId: string) => {
      if (!isAdmin) return;
      setDraggedPlayerId(playerId);
    },
    [isAdmin]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (targetPlayerId: string) => {
      if (!isAdmin || !draggedPlayerId || draggedPlayerId === targetPlayerId) {
        setDraggedPlayerId(null);
        return;
      }

      // Emit swap event
      const socket = socketManager.getSocket();
      if (socket?.connected && roomCode) {
        socket.emit('game:seating_swap', {
          room_code: roomCode,
          player_a_id: draggedPlayerId,
          player_b_id: targetPlayerId,
        });
      }

      setDraggedPlayerId(null);
    },
    [isAdmin, draggedPlayerId, roomCode]
  );

  const handleConfirmSeating = useCallback(async () => {
    if (!roomCode) return;
    setError(null);
    setIsConfirming(true);

    const socket = socketManager.getSocket();
    if (socket?.connected) {
      socket.emit('game:seating_confirmed', { room_code: roomCode });
    }
    // Navigation happens via game:seating_set event
  }, [roomCode]);

  return (
    <main className="min-h-screen pb-safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Seating Arrangement
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <ConnectionStatus />
              <span className="text-xs sm:text-sm text-muted-foreground">
                Room: {roomCode}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Seating Table */}
      <section className="max-w-6xl mx-auto px-4 py-8 flex flex-col items-center">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg w-full max-w-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Instructions */}
        <p className="text-sm text-muted-foreground mb-6 text-center">
          {isAdmin
            ? 'Drag players to swap their positions. Click "Set Seating" when ready.'
            : 'Waiting for admin to arrange seating...'}
        </p>

        {/* Circular table */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96">
          {/* Table background */}
          <div className="absolute inset-8 sm:inset-10 md:inset-12 rounded-full bg-card border-2 border-border" />

          {/* Center button (admin only) */}
          {isAdmin && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Button
                onClick={handleConfirmSeating}
                disabled={isConfirming}
                className="rounded-full w-24 h-24 sm:w-28 sm:h-28 text-sm font-bold shadow-lg"
              >
                {isConfirming ? 'Setting...' : 'Set\nSeating'}
              </Button>
            </div>
          )}

          {/* Player circles */}
          {sortedPlayers.map((player) => {
            const seatIndex = player.seatPosition ?? 0;
            const pos = SEAT_POSITIONS[seatIndex];
            if (!pos) return null;

            const isDragging = draggedPlayerId === player.userId;

            return (
              <div
                key={player.userId}
                className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                }}
              >
                {/* Seat number label */}
                <span className="text-xs font-medium text-muted-foreground">
                  #{pos.label}
                </span>

                {/* Player circle */}
                <div
                  draggable={isAdmin}
                  onDragStart={() => handleDragStart(player.userId)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(player.userId)}
                  className={`
                    w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center
                    text-xs sm:text-sm font-semibold text-center
                    border-2 transition-all duration-200
                    ${isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                    ${isDragging
                      ? 'opacity-50 scale-90 border-primary bg-primary/20'
                      : player.isConnected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-muted bg-muted/30 text-muted-foreground opacity-60'
                    }
                    ${isAdmin && !isDragging ? 'hover:border-primary/80 hover:shadow-md' : ''}
                  `}
                >
                  <span className="px-1 leading-tight truncate max-w-[3.5rem] sm:max-w-[4.5rem]">
                    {player.displayName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Non-admin waiting message */}
        {!isAdmin && (
          <p className="mt-6 text-sm text-muted-foreground animate-pulse">
            Waiting for the admin to confirm seating...
          </p>
        )}
      </section>
    </main>
  );
}

/**
 * Seating Selection Page
 *
 * Admin arranges player seating order before the first round.
 * Primary interaction: tap-to-select, tap-to-swap (mobile-friendly).
 * Secondary interaction: drag-and-drop (desktop enhancement).
 * Non-admin players see updates in real time.
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { socketManager } from '@/lib/socket/manager';
import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/shared/connection-status';
import type { SeatingUpdatedPayload, SeatingSetPayload } from '@/types/socket-events';

// Seat positions around the circular table (clockwise from top)
const SEAT_POSITIONS = [
  { label: '1', x: 50, y: 5 },   // Top (12 o'clock)
  { label: '2', x: 88, y: 50 },  // Right (3 o'clock)
  { label: '3', x: 50, y: 88 },  // Bottom (6 o'clock)
  { label: '4', x: 12, y: 50 },  // Left (9 o'clock)
];

export default function SeatingPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = React.use(params);
  const router = useRouter();

  // Selected player for tap-to-swap interaction
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Drag-and-drop state (desktop enhancement)
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [dragOverPlayerId, setDragOverPlayerId] = useState<string | null>(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether a drag actually moved (to distinguish click from drag)
  const didDragRef = useRef(false);

  const { roomCode, players, isAdmin } = useStore((state) => ({
    roomCode: state.roomCode,
    players: state.players,
    isAdmin: state.isAdmin,
  }));

  // Sort players by seat position for rendering
  const sortedPlayers = [...players]
    .filter((p) => p.seatPosition !== null)
    .sort((a, b) => (a.seatPosition ?? 0) - (b.seatPosition ?? 0));

  // --- Socket event handlers ---

  const emitSwap = useCallback(
    (playerAId: string, playerBId: string) => {
      const socket = socketManager.getSocket();
      if (socket?.connected && roomCode) {
        socket.emit('game:seating_swap', {
          room_code: roomCode,
          player_a_id: playerAId,
          player_b_id: playerBId,
        });
      }
    },
    [roomCode]
  );

  useSocketEvent(
    'game:seating_updated',
    useCallback((payload: SeatingUpdatedPayload) => {
      const store = useStore.getState();
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

  useSocketEvent(
    'game:seating_set',
    useCallback(
      (payload: SeatingSetPayload) => {
        const store = useStore.getState();
        const updatedPlayers = store.players.map((p) => {
          const serverPlayer = payload.players.find((sp) => sp.user_id === p.userId);
          if (serverPlayer) {
            return { ...p, seatPosition: serverPlayer.seat_position };
          }
          return p;
        });
        store.setPlayers(updatedPlayers);
        router.push(`/game/${payload.game_id}`);
      },
      [router]
    )
  );

  useSocketEvent(
    'error',
    useCallback((payload: { message?: string }) => {
      setError(payload.message ?? 'An error occurred');
      setIsConfirming(false);
    }, [])
  );

  // --- Tap-to-swap (primary interaction, works on mobile + desktop) ---

  const handlePlayerClick = useCallback(
    (playerId: string) => {
      if (!isAdmin) return;
      // If a drag just happened, ignore the click
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }

      if (!selectedPlayerId) {
        // First tap: select this player
        setSelectedPlayerId(playerId);
      } else if (selectedPlayerId === playerId) {
        // Tap same player: deselect
        setSelectedPlayerId(null);
      } else {
        // Tap different player: swap them
        emitSwap(selectedPlayerId, playerId);
        setSelectedPlayerId(null);
      }
    },
    [isAdmin, selectedPlayerId, emitSwap]
  );

  // --- Drag-and-drop (desktop enhancement) ---

  const handleDragStart = useCallback(
    (e: React.DragEvent, playerId: string) => {
      if (!isAdmin) return;
      e.dataTransfer.setData('text/plain', playerId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggedPlayerId(playerId);
      setSelectedPlayerId(null);
      didDragRef.current = false;
    },
    [isAdmin]
  );

  const handleDrag = useCallback(() => {
    didDragRef.current = true;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent, playerId: string) => {
      e.preventDefault();
      if (draggedPlayerId && draggedPlayerId !== playerId) {
        setDragOverPlayerId(playerId);
      }
    },
    [draggedPlayerId]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the actual target (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(related)) {
      setDragOverPlayerId(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetPlayerId: string) => {
      e.preventDefault();
      setDragOverPlayerId(null);

      const sourcePlayerId = e.dataTransfer.getData('text/plain');
      if (!sourcePlayerId || sourcePlayerId === targetPlayerId) {
        setDraggedPlayerId(null);
        return;
      }

      emitSwap(sourcePlayerId, targetPlayerId);
      setDraggedPlayerId(null);
    },
    [emitSwap]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedPlayerId(null);
    setDragOverPlayerId(null);
  }, []);

  // --- Confirm seating ---

  const handleConfirmSeating = useCallback(() => {
    if (!roomCode) return;

    const socket = socketManager.getSocket();
    if (!socket?.connected) {
      setError('Not connected to server');
      return;
    }

    setError(null);
    setIsConfirming(true);
    setSelectedPlayerId(null);
    socket.emit('game:seating_confirmed', { room_code: roomCode });

    // Reset button after timeout in case server doesn't respond
    setTimeout(() => setIsConfirming(false), 5000);
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
            ? selectedPlayerId
              ? 'Now tap another player to swap positions.'
              : 'Tap a player to select, then tap another to swap.'
            : 'Waiting for admin to arrange seating...'}
        </p>

        {/* Circular table */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96">
          {/* Table background */}
          <div className="absolute inset-8 sm:inset-10 md:inset-12 rounded-full bg-card border-2 border-border" />

          {/* Center button (admin only) */}
          {isAdmin && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <Button
                onClick={handleConfirmSeating}
                disabled={isConfirming}
                className="rounded-full w-24 h-24 sm:w-28 sm:h-28 text-sm font-bold shadow-lg whitespace-pre-line pointer-events-auto"
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
            const isDragOver = dragOverPlayerId === player.userId;
            const isSelected = selectedPlayerId === player.userId;
            const isSwapTarget = selectedPlayerId !== null && selectedPlayerId !== player.userId;

            return (
              <div
                key={player.userId}
                className={`
                  absolute flex flex-col items-center gap-1
                  -translate-x-1/2 -translate-y-1/2
                  transition-all duration-300
                  ${isAdmin ? 'cursor-pointer' : ''}
                `}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                }}
                // Click handler for tap-to-swap
                onClick={() => handlePlayerClick(player.userId)}
                // Drop zone: entire seat area (label + circle)
                onDragOver={isAdmin ? handleDragOver : undefined}
                onDragEnter={isAdmin ? (e) => handleDragEnter(e, player.userId) : undefined}
                onDragLeave={isAdmin ? handleDragLeave : undefined}
                onDrop={isAdmin ? (e) => handleDrop(e, player.userId) : undefined}
              >
                {/* Seat number label */}
                <span className="text-xs font-medium text-muted-foreground select-none pointer-events-none">
                  #{pos.label}
                </span>

                {/* Player circle */}
                <div
                  draggable={isAdmin}
                  onDragStart={isAdmin ? (e) => handleDragStart(e, player.userId) : undefined}
                  onDrag={isAdmin ? handleDrag : undefined}
                  onDragEnd={isAdmin ? handleDragEnd : undefined}
                  className={`
                    w-16 h-16 sm:w-20 sm:h-20 rounded-full
                    flex items-center justify-center select-none
                    text-xs sm:text-sm font-semibold text-center
                    border-2 transition-all duration-200
                    ${isAdmin ? 'cursor-pointer active:scale-95' : 'cursor-default'}
                    ${isDragging
                      ? 'opacity-50 scale-90 border-primary bg-primary/20'
                      : isDragOver
                        ? 'scale-110 border-primary bg-primary/30 ring-2 ring-primary/50'
                        : isSelected
                          ? 'scale-110 border-primary bg-primary/30 ring-2 ring-primary/60 shadow-lg'
                          : isSwapTarget
                            ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
                            : player.isConnected
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-muted bg-muted/30 text-muted-foreground opacity-60'
                    }
                    ${isAdmin && !isDragging && !isSelected ? 'hover:border-primary/80 hover:shadow-md' : ''}
                  `}
                >
                  <span className="pointer-events-none px-1 leading-tight truncate max-w-[3.5rem] sm:max-w-[4.5rem]">
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

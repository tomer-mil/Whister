'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { socketManager } from '@/lib/socket/manager';
import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/shared/connection-status';
import { PlayerShape } from '@/components/ui/player-shape';
import { PhaseIndicator } from '@/components/ui/phase-indicator';
import type { SeatingUpdatedPayload, SeatingSetPayload } from '@/types/socket-events';

const SEAT_POSITIONS = [
  { label: '1', x: 50, y: 5 },   // Top
  { label: '2', x: 88, y: 50 },  // Right
  { label: '3', x: 50, y: 88 },  // Bottom
  { label: '4', x: 12, y: 50 },  // Left
];

export default function SeatingPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  React.use(params);
  const router = useRouter();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [dragOverPlayerId, setDragOverPlayerId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didDragRef = useRef(false);

  const { roomCode, players, isAdmin } = useStore((state) => ({
    roomCode: state.roomCode,
    players: state.players,
    isAdmin: state.isAdmin,
  }));

  const sortedPlayers = [...players]
    .filter((p) => p.seatPosition !== null)
    .sort((a, b) => (a.seatPosition ?? 0) - (b.seatPosition ?? 0));

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

  const handlePlayerClick = useCallback(
    (playerId: string) => {
      if (!isAdmin) return;
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }

      if (!selectedPlayerId) {
        setSelectedPlayerId(playerId);
      } else if (selectedPlayerId === playerId) {
        setSelectedPlayerId(null);
      } else {
        emitSwap(selectedPlayerId, playerId);
        setSelectedPlayerId(null);
      }
    },
    [isAdmin, selectedPlayerId, emitSwap]
  );

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
    setTimeout(() => setIsConfirming(false), 5000);
  }, [roomCode]);

  return (
    <main className="min-h-screen flex flex-col pb-safe-bottom">
      {/* Top: Phase indicator + room info */}
      <header className="px-6 pt-4 pb-2">
        <PhaseIndicator currentPhase={0} />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground uppercase tracking-[0.1em]">
            {roomCode}
          </span>
          <ConnectionStatus />
        </div>
      </header>

      {/* Seating area */}
      <section className="flex-1 flex flex-col items-center justify-center px-4">
        {error && (
          <p className="text-sm text-terracotta text-center mb-4">{error}</p>
        )}

        {/* Compass layout with cross lines */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96">
          {/* Cross lines connecting positions */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            {/* Vertical line */}
            <line x1="50" y1="18" x2="50" y2="82" stroke="hsl(var(--border-strong))" strokeWidth="1.5" />
            {/* Horizontal line */}
            <line x1="18" y1="50" x2="82" y2="50" stroke="hsl(var(--border-strong))" strokeWidth="1.5" />
          </svg>

          {/* Player shapes at compass positions */}
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
                  absolute flex flex-col items-center gap-1.5
                  -translate-x-1/2 -translate-y-1/2
                  transition-all duration-200
                  ${isAdmin ? 'cursor-pointer' : ''}
                `}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                }}
                onClick={() => handlePlayerClick(player.userId)}
                onDragOver={isAdmin ? handleDragOver : undefined}
                onDragEnter={isAdmin ? (e) => handleDragEnter(e, player.userId) : undefined}
                onDragLeave={isAdmin ? handleDragLeave : undefined}
                onDrop={isAdmin ? (e) => handleDrop(e, player.userId) : undefined}
              >
                <div
                  draggable={isAdmin}
                  onDragStart={isAdmin ? (e) => handleDragStart(e, player.userId) : undefined}
                  onDrag={isAdmin ? handleDrag : undefined}
                  onDragEnd={isAdmin ? handleDragEnd : undefined}
                  className={`
                    transition-transform duration-200
                    ${isDragging ? 'opacity-50 scale-90' : ''}
                    ${isDragOver ? 'scale-110' : ''}
                    ${isSelected ? 'scale-110' : ''}
                    ${isAdmin && !isDragging ? 'active:scale-95' : ''}
                  `}
                >
                  <PlayerShape
                    playerIndex={seatIndex}
                    size={48}
                    filled={isSelected || isDragOver}
                    color={
                      isSelected || isDragOver
                        ? '#D4A030'
                        : isSwapTarget
                          ? '#D4A030'
                          : undefined
                    }
                  />
                </div>

                <span className={`
                  text-xs font-medium text-center max-w-[5rem] truncate
                  ${isSelected ? 'text-ochre font-semibold' : 'text-foreground'}
                  ${!player.isConnected ? 'opacity-50' : ''}
                `}>
                  {player.displayName}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom action */}
      <footer className="px-6 pb-6">
        {isAdmin ? (
          <Button
            fullWidth
            size="xl"
            onClick={handleConfirmSeating}
            disabled={isConfirming}
          >
            {isConfirming ? 'Setting...' : 'Confirm'}
          </Button>
        ) : (
          <p className="text-center text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground py-4">
            Waiting for host
          </p>
        )}
      </footer>
    </main>
  );
}

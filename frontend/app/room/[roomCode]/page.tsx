/**
 * Room Lobby Page
 * Displays room code, players, and seating arrangement
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RoomCodeDisplay } from '@/components/room/room-code-display';
import { PlayerList } from '@/components/room/player-list';
import { ConnectionStatus } from '@/components/shared/connection-status';
import { roomsApi } from '@/lib/api';
import Link from 'next/link';

export default function RoomLobbyPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    isAdmin,
    players,
    roomCode: currentRoomCode,
  } = useStore((state) => ({
    isAdmin: state.isAdmin,
    players: state.players,
    roomCode: state.roomCode,
  }));

  // Track if we've waited for WebSocket to connect
  const [hasWaited, setHasWaited] = useState(false);

  // Wait a bit for WebSocket to connect and set room state before redirecting
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasWaited(true);
    }, 3000); // Give 3 seconds for WebSocket to connect

    return () => clearTimeout(timer);
  }, []);

  // Redirect if not in a room (only after waiting for WebSocket)
  useEffect(() => {
    if (hasWaited && !currentRoomCode) {
      console.log('[RoomLobbyPage] No room code after waiting, redirecting to join');
      router.push('/room/join');
    }
  }, [hasWaited, currentRoomCode, router]);

  const handleStartGame = async () => {
    setError(null);
    setIsStarting(true);

    try {
      await roomsApi.startGame(roomCode);
      // Redirect happens via WebSocket event in layout
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start game';
      setError(errorMessage);
      setIsStarting(false);
    }
  };

  const canStartGame = players.length === 4 && isAdmin;

  return (
    <main className="min-h-screen pb-safe-bottom">
      {/* Header - Compact on mobile */}
      <header className="bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 md:py-6 flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Room Lobby</h1>
            <div className="flex items-center gap-2 mt-1 sm:mt-2">
              <ConnectionStatus />
              <span className="text-xs sm:text-sm text-muted-foreground">
                {roomCode}
              </span>
            </div>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Leave
            </Button>
          </Link>
        </div>
      </header>

      {/* Content - Mobile-first layout: players first, then room code */}
      <section className="max-w-6xl mx-auto px-4 py-4 sm:py-6 md:py-8">
        {/* Error Message */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Mobile: Players first, Room code second */}
          {/* Desktop: Room code left, Players right */}

          {/* Room Code - Order 2 on mobile, Order 1 on desktop */}
          <div className="order-2 lg:order-1 lg:col-span-1">
            <RoomCodeDisplay roomCode={roomCode} />
          </div>

          {/* Players & Controls - Order 1 on mobile, Order 2 on desktop */}
          <div className="order-1 lg:order-2 lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Player List */}
            <PlayerList players={players} maxPlayers={4} />

            {/* Admin Controls */}
            {isAdmin && (
              <Card variant="elevated" className="p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Start Game</h3>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {players.length}/4 players
                    </span>
                  </div>
                  <Button
                    fullWidth
                    variant={canStartGame ? 'primary' : 'outline'}
                    disabled={!canStartGame || isStarting}
                    onClick={handleStartGame}
                    size="lg"
                  >
                    {isStarting ? 'Starting...' : canStartGame ? 'Start Playing' : 'Waiting for Players...'}
                  </Button>
                </div>
              </Card>
            )}

            {/* Non-Admin Info */}
            {!isAdmin && (
              <Card variant="outlined" className="p-4">
                <p className="text-sm text-muted-foreground text-center">
                  Waiting for the room admin to start the game...
                </p>
              </Card>
            )}

            {/* Game Rules - Collapsible on mobile via details/summary */}
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none p-3 sm:p-4 bg-card border border-border rounded-lg">
                <span className="text-sm font-medium text-foreground">Game Rules</span>
                <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-2 p-3 sm:p-4 bg-card/50 border border-border rounded-lg space-y-2 text-sm text-muted-foreground">
                <p>• Whist is played with 4 players</p>
                <p>• The game consists of 13 rounds</p>
                <p>• Players bid on tricks and earn points</p>
                <p>• Highest total score wins!</p>
              </div>
            </details>
          </div>
        </div>
      </section>
    </main>
  );
}

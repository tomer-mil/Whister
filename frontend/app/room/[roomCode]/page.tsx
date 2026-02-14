'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
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
    currentRoomCode,
  } = useStore((state) => ({
    isAdmin: state.isAdmin,
    players: state.players,
    currentRoomCode: state.currentRoomCode,
  }));

  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasHydrated(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hasHydrated && !currentRoomCode) {
      router.push('/room/join');
    }
  }, [hasHydrated, currentRoomCode, router]);

  const handleStartGame = async () => {
    setError(null);
    setIsStarting(true);

    try {
      await roomsApi.startGame(roomCode);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start game';
      setError(errorMessage);
      setIsStarting(false);
    }
  };

  const canStartGame = players.length === 4 && isAdmin;

  return (
    <main className="min-h-screen flex flex-col pb-safe-bottom">
      {/* Top strip: room code + connection */}
      <header className="px-6 py-4 flex items-center justify-between border-b-2 border-foreground">
        <RoomCodeDisplay roomCode={roomCode} />
        <ConnectionStatus />
      </header>

      {/* Player list */}
      <section className="flex-1 px-6 py-6">
        {error && (
          <p className="text-sm text-terracotta text-center mb-4">{error}</p>
        )}

        <PlayerList players={players} maxPlayers={4} />
      </section>

      {/* Bottom action */}
      <footer className="px-6 pb-6 space-y-3">
        {isAdmin ? (
          <Button
            fullWidth
            size="xl"
            disabled={!canStartGame || isStarting}
            onClick={handleStartGame}
          >
            {isStarting ? 'Starting...' : canStartGame ? 'Start Game' : `Waiting ${players.length}/4`}
          </Button>
        ) : (
          <p className="text-center text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground py-4">
            Waiting for host
          </p>
        )}

        <div className="text-center">
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.1em] text-terracotta hover:underline"
          >
            Leave
          </Link>
        </div>
      </footer>
    </main>
  );
}

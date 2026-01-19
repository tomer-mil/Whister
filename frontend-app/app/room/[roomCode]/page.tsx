/**
 * Room Lobby Page
 * Displays room code, players, and seating arrangement
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RoomCodeDisplay } from '@/components/room/room-code-display';
import { PlayerList } from '@/components/room/player-list';
import { ConnectionStatus } from '@/components/shared/connection-status';
import { roomsApi } from '@/lib/api';
import Link from 'next/link';

export default function RoomLobbyPage({
  params,
}: {
  params: { roomCode: string };
}) {
  const { roomCode } = params;
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

  // Redirect if not in a room
  useEffect(() => {
    if (!currentRoomCode) {
      router.push('/room/join');
    }
  }, [currentRoomCode, router]);

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
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Room Lobby</h1>
            <div className="flex items-center gap-2 mt-2">
              <ConnectionStatus />
              <span className="text-sm text-gray-600">
                Room: {roomCode}
              </span>
            </div>
          </div>
          <Link href="/">
            <Button variant="ghost">Back to Home</Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Room Code & Info */}
          <div className="lg:col-span-1">
            <RoomCodeDisplay roomCode={roomCode} />
          </div>

          {/* Right Column - Players & Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Player List */}
            <PlayerList players={players} maxPlayers={4} />

            {/* Admin Controls */}
            {isAdmin && (
              <Card variant="elevated">
                <CardHeader>
                  <CardTitle>Admin Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                    {players.length === 4
                      ? 'All players have joined! Ready to start the game.'
                      : `Waiting for more players (${players.length}/4)`}
                  </p>
                  <Button
                    fullWidth
                    variant={canStartGame ? 'primary' : 'outline'}
                    disabled={!canStartGame || isStarting}
                    onClick={handleStartGame}
                  >
                    {isStarting ? 'Starting Game...' : 'Start Game'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Non-Admin Info */}
            {!isAdmin && (
              <Card variant="outlined">
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600 text-center">
                    Waiting for the room admin to start the game...
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Game Rules */}
            <Card variant="outlined">
              <CardHeader>
                <CardTitle>Game Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <p>• Whist is played with 4 players</p>
                <p>• The game consists of 13 rounds</p>
                <p>• Players bid on tricks and earn points</p>
                <p>• Highest total score wins!</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

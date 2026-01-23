/**
 * Game Page
 * Main gameplay interface for active games
 */

'use client';

import React from 'react';
import { useStore } from '@/stores';
import { Card } from '@/components/ui/card';
import { ConnectionStatus } from '@/components/shared/connection-status';

export default function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = React.use(params);

  const { players, roomCode } = useStore((state) => ({
    players: state.players,
    roomCode: state.roomCode,
  }));

  return (
    <main className="min-h-screen pb-safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Game in Progress</h1>
            <div className="flex items-center gap-2 mt-1">
              <ConnectionStatus />
              <span className="text-xs sm:text-sm text-muted-foreground">
                Room: {roomCode}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Game Content */}
      <section className="max-w-6xl mx-auto px-4 py-6">
        <Card variant="elevated" className="p-6">
          <h2 className="text-lg font-semibold mb-4">Game Started</h2>
          <p className="text-muted-foreground mb-4">
            Game ID: <code className="bg-muted px-2 py-1 rounded text-sm">{gameId}</code>
          </p>

          <div className="space-y-4">
            <h3 className="font-medium">Players:</h3>
            <div className="grid grid-cols-2 gap-4">
              {players.map((player, index) => (
                <div
                  key={player.userId}
                  className="p-3 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{player.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      Seat {player.seatPosition ?? index}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {player.isAdmin && <span className="text-primary">Admin</span>}
                    {!player.isConnected && <span className="text-destructive ml-2">Disconnected</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-center">
              Bidding phase will be implemented next. The game infrastructure is now working.
            </p>
          </div>
        </Card>
      </section>
    </main>
  );
}

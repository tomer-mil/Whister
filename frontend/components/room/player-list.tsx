/**
 * Player List Component
 * Displays all 4 player slots in a room
 */

'use client';

import { PlayerCard } from './player-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { RoomPlayer } from '@/types/store';

export interface PlayerListProps {
  players: RoomPlayer[];
  maxPlayers?: number;
}

export function PlayerList({ players, maxPlayers = 4 }: PlayerListProps) {
  // Create array of 4 slots with players
  const slots = Array.from({ length: maxPlayers }, (_, i) => {
    // Find player for this seat (0-indexed, but display as 1-4)
    const player = players.find((p) => p.seatPosition === i) || null;
    return { seatNumber: i + 1, player };
  });

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Players ({players.length}/{maxPlayers})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {slots.map((slot) => (
            <PlayerCard
              key={slot.seatNumber}
              player={slot.player}
              seatNumber={slot.seatNumber}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default PlayerList;

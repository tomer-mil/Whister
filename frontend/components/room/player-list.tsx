'use client';

import { PlayerCard } from './player-card';
import type { RoomPlayer } from '@/types/store';

export interface PlayerListProps {
  players: RoomPlayer[];
  maxPlayers?: number;
}

export function PlayerList({ players, maxPlayers = 4 }: PlayerListProps) {
  const slots = Array.from({ length: maxPlayers }, (_, i) => {
    const player = players.find((p) => p.seatPosition === i) || null;
    return { seatNumber: i + 1, player };
  });

  return (
    <div className="flex flex-col divide-y divide-border">
      {slots.map((slot) => (
        <PlayerCard
          key={slot.seatNumber}
          player={slot.player}
          seatNumber={slot.seatNumber}
          data-testid={`lobby-player-card-${slot.seatNumber - 1}`}
        />
      ))}
    </div>
  );
}

export default PlayerList;

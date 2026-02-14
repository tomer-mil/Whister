'use client';

import { PlayerShape } from '@/components/ui/player-shape';
import { useStore } from '@/stores';
import type { RoomPlayer } from '@/types/store';

export interface PlayerCardProps {
  player: RoomPlayer | null;
  seatNumber: number;
}

export function PlayerCard({ player, seatNumber }: PlayerCardProps) {
  const currentUserId = useStore((state) => state.user?.id);
  const isCurrentUser = player && player.userId === currentUserId;

  if (!player) {
    return (
      <div className="flex items-center gap-3 py-3 px-2">
        <PlayerShape
          playerIndex={seatNumber - 1}
          size={20}
          filled={false}
          className="text-muted-foreground"
        />
        <span className="text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Waiting
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 py-3 px-2 transition-opacity ${
        !player.isConnected ? 'opacity-50' : ''
      } ${isCurrentUser ? 'bg-card' : ''}`}
    >
      <PlayerShape
        playerIndex={seatNumber - 1}
        size={20}
        filled={true}
      />
      <span className="text-sm font-medium text-foreground flex-1 truncate">
        {player.displayName}
      </span>
      {player.isAdmin && (
        <div className="w-2 h-2 bg-ochre" title="Admin" />
      )}
      <div
        className={`w-2 h-2 ${
          player.isConnected ? 'bg-success' : 'bg-terracotta'
        }`}
        title={player.isConnected ? 'Connected' : 'Disconnected'}
      />
    </div>
  );
}

export default PlayerCard;

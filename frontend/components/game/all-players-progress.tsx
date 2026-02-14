'use client';

import { PlayerProgressRing } from './player-progress-ring';

export interface PlayerProgress {
  playerId: string;
  playerName: string;
  tricksWon: number;
  contract: number;
}

export interface AllPlayersProgressProps {
  players: PlayerProgress[];
  currentPlayerId?: string;
  totalTricksPlayed: number;
}

export function AllPlayersProgress({
  players,
  currentPlayerId,
  totalTricksPlayed,
}: AllPlayersProgressProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-xs text-muted-foreground uppercase tracking-[0.1em]">
          Tricks
        </span>
        <span className="text-sm font-bold">{totalTricksPlayed} <span className="text-muted-foreground font-normal">/ 13</span></span>
      </div>

      <div className="flex gap-2">
        {players.map((player, index) => (
          <PlayerProgressRing
            key={player.playerId}
            playerName={player.playerName}
            tricksWon={player.tricksWon}
            contract={player.contract}
            seatIndex={index}
            isYourPlayer={player.playerId === currentPlayerId}
          />
        ))}
      </div>
    </div>
  );
}

export default AllPlayersProgress;

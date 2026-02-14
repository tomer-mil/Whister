'use client';

import { motion } from 'framer-motion';
import { PlayerShape } from '@/components/ui/player-shape';

export interface PlayerStatus {
  playerId: string;
  displayName: string;
  seatPosition: number;
  status: 'waiting' | 'current_turn' | 'passed' | 'bid';
  bid?: number;
  suit?: string;
}

export interface PlayerBidStatusProps {
  players: PlayerStatus[];
  currentTurnPlayerId?: string;
}

export function PlayerBidStatus({ players, currentTurnPlayerId }: PlayerBidStatusProps) {
  return (
    <div className="divide-y divide-border">
      {players.map((player) => {
        const isCurrent = player.playerId === currentTurnPlayerId;
        return (
          <motion.div
            key={player.playerId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`flex items-center gap-3 py-3 px-1 ${
              isCurrent ? 'bg-card' : ''
            } ${player.status === 'passed' ? 'opacity-40' : ''}`}
          >
            <PlayerShape
              playerIndex={player.seatPosition}
              size={18}
              filled={player.status === 'bid'}
              className={player.status === 'passed' ? 'line-through' : ''}
            />

            <span className="text-sm text-foreground flex-1 truncate">
              {player.displayName}
            </span>

            {player.bid !== undefined && (
              <motion.span
                key={`${player.playerId}-bid-${player.bid}`}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="text-lg font-bold text-foreground"
              >
                {player.bid}
              </motion.span>
            )}

            {isCurrent && (
              <div className="w-2 h-2 bg-ochre" />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export default PlayerBidStatus;

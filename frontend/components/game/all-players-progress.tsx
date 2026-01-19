/**
 * All Players Progress Component
 * Grid showing progress for all 4 players
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
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
  const maxTricks = 13;
  const tricksRemaining = maxTricks - totalTricksPlayed;

  return (
    <Card variant="outlined" className="p-4">
      <div className="space-y-3">
        {/* Tricks summary */}
        <div className="text-center pb-2 border-b">
          <p className="text-sm text-gray-600">Tricks Played</p>
          <motion.p
            key={totalTricksPlayed}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-2xl font-bold text-gray-900"
          >
            {totalTricksPlayed} <span className="text-lg text-gray-500">/ {maxTricks}</span>
          </motion.p>
          <p className="text-xs text-gray-500 mt-1">
            {tricksRemaining} remaining
          </p>
        </div>

        {/* Players grid */}
        <div className="grid grid-cols-2 gap-2">
          {players.map((player) => (
            <motion.div
              key={player.playerId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <PlayerProgressRing
                playerName={player.playerName}
                tricksWon={player.tricksWon}
                contract={player.contract}
                maxTricks={maxTricks}
                isYourPlayer={player.playerId === currentPlayerId}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default AllPlayersProgress;

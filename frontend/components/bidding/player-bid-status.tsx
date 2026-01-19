/**
 * Player Bid Status Component
 * List of all 4 players with their bid status
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/shared/avatar';

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
  const getStatusColor = (status: PlayerStatus['status'], isCurrent: boolean) => {
    if (isCurrent) return 'bg-blue-50 border-blue-200';
    if (status === 'passed') return 'bg-gray-50 border-gray-200 opacity-60';
    if (status === 'bid') return 'bg-green-50 border-green-200';
    return 'bg-white border-gray-200';
  };

  const getStatusBadge = (status: PlayerStatus['status'], isCurrent: boolean) => {
    if (isCurrent) return 'Your Turn';
    if (status === 'passed') return 'Passed';
    if (status === 'bid') return 'Bid Placed';
    return 'Waiting';
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Players</h3>
      <div className="space-y-2">
        {players.map((player) => {
          const isCurrent = player.playerId === currentTurnPlayerId;
          return (
            <motion.div
              key={player.playerId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <Card
                variant="outlined"
                className={`p-3 border-2 transition-all ${getStatusColor(
                  player.status,
                  isCurrent
                )} ${isCurrent ? 'ring-2 ring-blue-400' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Avatar
                      initials={player.displayName.charAt(0)}
                      size="sm"
                      alt={player.displayName}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {player.displayName}
                      </p>
                      <p className="text-xs text-gray-500">Seat {player.seatPosition}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {player.bid !== undefined && (
                      <motion.div
                        key={`${player.playerId}-bid-${player.bid}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="text-lg font-bold text-green-600"
                      >
                        {player.bid}
                      </motion.div>
                    )}
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700 whitespace-nowrap">
                      {getStatusBadge(player.status, isCurrent)}
                    </span>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default PlayerBidStatus;

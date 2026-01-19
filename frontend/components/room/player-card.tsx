/**
 * Player Card Component
 * Displays individual player information
 */

'use client';

import { Avatar } from '@/components/shared/avatar';
import { Card } from '@/components/ui/card';
import type { RoomPlayer } from '@/types/store';

export interface PlayerCardProps {
  player: RoomPlayer | null;
  seatNumber: number;
}

export function PlayerCard({ player, seatNumber }: PlayerCardProps) {
  if (!player) {
    return (
      <Card variant="outlined" className="p-4">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-400">?</span>
            </div>
          </div>
          <p className="text-sm font-medium text-gray-400">Seat {seatNumber}</p>
          <p className="text-xs text-gray-400">Waiting for player...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      variant="elevated"
      className={`p-4 transition-opacity ${
        !player.isConnected ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar initials={player.displayName.charAt(0)} size="md" alt={player.displayName} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {player.displayName}
              </p>
              <p className="text-xs text-gray-500">Seat {seatNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {player.isAdmin && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Admin
              </span>
            )}
            <div
              className={`w-2 h-2 rounded-full ${
                player.isConnected ? 'bg-green-500' : 'bg-gray-300'
              }`}
              title={player.isConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default PlayerCard;

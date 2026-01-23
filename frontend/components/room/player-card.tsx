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
      <Card variant="outlined" className="p-4 border-dashed">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-secondary/50 rounded-full flex items-center justify-center border-2 border-dashed border-border">
              <span className="text-muted-foreground text-xl">+</span>
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Seat {seatNumber}</p>
          <p className="text-xs text-muted-foreground">Waiting...</p>
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
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">
                  {player.displayName}
                </p>
                {player.isAdmin && (
                  <span className="text-amber-400 text-sm" title="Room Admin">&#9733;</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Seat {seatNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                player.isConnected ? 'bg-success' : 'bg-destructive/60'
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

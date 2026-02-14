'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface PlayerOption {
  playerId: string;
  playerName: string;
}

export interface AdminControlsProps {
  players: PlayerOption[];
  onUndoTrick?: (playerId: string) => Promise<void>;
  onEndRound?: () => Promise<void>;
  canEndRound?: boolean;
  isLoading?: boolean;
  error?: string;
}

export function AdminControls({
  players,
  onUndoTrick,
  onEndRound,
  canEndRound = false,
  isLoading = false,
  error,
}: AdminControlsProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isUndoLoading, setIsUndoLoading] = useState(false);

  const handleUndo = async () => {
    if (!selectedPlayerId || !onUndoTrick) return;

    setIsUndoLoading(true);
    try {
      await onUndoTrick(selectedPlayerId);
      setSelectedPlayerId(null);
    } catch {
      // Error is passed via error prop
    } finally {
      setIsUndoLoading(false);
    }
  };

  const handleEndRound = async () => {
    if (!onEndRound || isLoading) return;
    try {
      await onEndRound();
    } catch {
      // Error is passed via error prop
    }
  };

  return (
    <div className="border-t border-border pt-4 space-y-3">
      {/* Undo trick */}
      {onUndoTrick && (
        <div className="flex gap-2">
          <select
            value={selectedPlayerId || ''}
            onChange={(e) => setSelectedPlayerId(e.target.value || null)}
            disabled={isUndoLoading}
            className="flex-1 bg-transparent border-0 border-b-2 border-muted px-0 py-2 text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-40"
          >
            <option value="">Select player...</option>
            {players.map((player) => (
              <option key={player.playerId} value={player.playerId}>
                {player.playerName}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={!selectedPlayerId || isUndoLoading}
          >
            {isUndoLoading ? 'Undoing...' : 'Undo'}
          </Button>
        </div>
      )}

      {/* End round */}
      {onEndRound && (
        <Button
          variant={canEndRound ? 'secondary' : 'outline'}
          size="sm"
          onClick={handleEndRound}
          disabled={!canEndRound || isLoading}
          fullWidth
          className={canEndRound ? 'border-terracotta text-terracotta hover:bg-terracotta hover:text-background' : ''}
        >
          {isLoading ? 'Ending...' : 'End Round'}
        </Button>
      )}

      {error && (
        <p className="text-xs text-terracotta">{error}</p>
      )}
    </div>
  );
}

export default AdminControls;

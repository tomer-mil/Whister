/**
 * Admin Controls Component
 * Undo and end round controls for admin users
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';

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
    } catch (err) {
      // Error is passed via error prop
    } finally {
      setIsUndoLoading(false);
    }
  };

  const handleEndRound = async () => {
    if (!onEndRound || isLoading) return;
    try {
      await onEndRound();
    } catch (err) {
      // Error is passed via error prop
    }
  };

  return (
    <Card variant="outlined" className="p-4 bg-yellow-50 border-yellow-200">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-yellow-900">🔧 Admin Controls</p>

        {/* Undo trick */}
        {onUndoTrick && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <label className="text-xs font-medium text-gray-700">
              Undo Trick
            </label>
            <div className="flex gap-2">
              <select
                value={selectedPlayerId || ''}
                onChange={(e) => setSelectedPlayerId(e.target.value || null)}
                disabled={isUndoLoading}
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded bg-white disabled:opacity-50"
              >
                <option value="">Select player...</option>
                {players.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.playerName}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUndo}
                disabled={!selectedPlayerId || isUndoLoading}
              >
                {isUndoLoading ? '⏳' : '↩️'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* End round */}
        {onEndRound && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Button
              variant={canEndRound ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleEndRound}
              disabled={!canEndRound || isLoading}
              className="w-full"
            >
              {isLoading ? '⏳ Ending...' : '✓ End Round'}
            </Button>
            {!canEndRound && (
              <p className="text-xs text-gray-600 mt-1">
                (Claim all 13 tricks to enable)
              </p>
            )}
          </motion.div>
        )}

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-100 border border-red-300 rounded px-2 py-1"
          >
            <p className="text-xs text-red-700">{error}</p>
          </motion.div>
        )}
      </div>
    </Card>
  );
}

export default AdminControls;

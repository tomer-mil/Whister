/**
 * Trump Bidding Panel Component
 * Main bidding interface during trump bidding phase
 */

'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BidCounter } from './bid-counter';
import { SuitSelector } from './suit-selector';
import { PlayerBidStatus } from './player-bid-status';
import { FrischIndicator } from './frisch-indicator';
import { isValidTrumpBid } from '@/lib/validation/rules';
import type { TrumpSuit } from '@/types/game';

export interface TrumpBiddingPanelProps {
  currentSuit: TrumpSuit | null;
  currentHighestBid: number;
  minimumBid: number;
  isYourTurn: boolean;
  frischRound?: number;
  players: Array<{
    playerId: string;
    displayName: string;
    seatPosition: number;
    status: 'waiting' | 'current_turn' | 'passed' | 'bid';
    bid?: number;
  }>;
  currentTurnPlayerId?: string;
  onBid: (amount: number, suit: TrumpSuit) => Promise<void>;
  onPass: () => Promise<void>;
  isLoading?: boolean;
  error?: string;
}

export function TrumpBiddingPanel({
  currentSuit,
  currentHighestBid,
  minimumBid,
  isYourTurn,
  frischRound = 0,
  players,
  currentTurnPlayerId,
  onBid,
  onPass,
  isLoading = false,
  error,
}: TrumpBiddingPanelProps) {
  const [selectedBid, setSelectedBid] = useState(Math.max(currentHighestBid + 1, minimumBid));
  const [selectedSuit, setSelectedSuit] = useState<TrumpSuit | null>(null);

  const isValidBid = useCallback(() => {
    return (
      selectedSuit !== null &&
      isValidTrumpBid(selectedBid, currentHighestBid, minimumBid)
    );
  }, [selectedBid, selectedSuit, currentHighestBid, minimumBid]);

  const handleBid = useCallback(async () => {
    if (!isValidBid() || !selectedSuit || isLoading) return;
    try {
      await onBid(selectedBid, selectedSuit);
    } catch (err) {
      // Error is passed via error prop
    }
  }, [isValidBid, selectedBid, selectedSuit, onBid, isLoading]);

  const handlePass = useCallback(async () => {
    if (isLoading) return;
    try {
      await onPass();
    } catch (err) {
      // Error is passed via error prop
    }
  }, [onPass, isLoading]);

  return (
    <div className="space-y-4">
      {/* Current highest bid display */}
      <Card variant="elevated" className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">Current Highest Bid</p>
          <motion.div
            key={currentHighestBid}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex items-center justify-center gap-3"
          >
            <span className="text-4xl font-bold text-gray-900">{currentHighestBid}</span>
            {currentSuit && (
              <span className="text-3xl">{getSuitSymbol(currentSuit)}</span>
            )}
          </motion.div>
        </div>
      </Card>

      {/* Your bid selection */}
      {isYourTurn && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Bid counter */}
          <div className="flex justify-center">
            <BidCounter
              value={selectedBid}
              min={Math.max(5, minimumBid)}
              max={13}
              onChange={setSelectedBid}
              disabled={isLoading}
              label="Your Bid"
            />
          </div>

          {/* Suit selector */}
          <div className="flex justify-center">
            <SuitSelector
              value={selectedSuit}
              onChange={setSelectedSuit}
              disabled={isLoading}
              label="Trump Suit"
            />
          </div>

          {/* Frisch indicator if applicable */}
          {frischRound > 0 && (
            <FrischIndicator frischRound={frischRound} minimumBid={minimumBid} />
          )}

          {/* Action buttons */}
          <div className="flex gap-3 justify-center">
            <Button
              variant="primary"
              onClick={handleBid}
              disabled={!isValidBid() || isLoading}
              className="min-w-24"
            >
              {isLoading ? 'Bidding...' : 'Call'}
            </Button>
            <Button
              variant="secondary"
              onClick={handlePass}
              disabled={isLoading}
              className="min-w-24"
            >
              {isLoading ? 'Passing...' : 'Pass'}
            </Button>
          </div>
        </motion.div>
      )}

      {!isYourTurn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gray-50 rounded-lg p-4 text-center"
        >
          <p className="text-sm text-gray-600">Waiting for another player's bid...</p>
        </motion.div>
      )}

      {/* Player bid status */}
      <PlayerBidStatus players={players} currentTurnPlayerId={currentTurnPlayerId} />
    </div>
  );
}

function getSuitSymbol(suit: TrumpSuit): string {
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
    no_trump: 'NT',
  };
  return symbols[suit] || '';
}

export default TrumpBiddingPanel;

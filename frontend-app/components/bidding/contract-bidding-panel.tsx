/**
 * Contract Bidding Panel Component
 * Main bidding interface during contract bidding phase
 */

'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BidCounter } from './bid-counter';
import { PlayerBidStatus } from './player-bid-status';
import { isValidContractBid, getContractBidErrorMessage } from '@/lib/validation/rules';
import type { TrumpSuit } from '@/types/game';

export interface ContractBiddingPanelProps {
  trumpSuit: TrumpSuit;
  trumpWinner: string;
  currentContractSum: number;
  targetSum?: number;
  isYourTurn: boolean;
  isLastBidder: boolean;
  players: Array<{
    playerId: string;
    displayName: string;
    seatPosition: number;
    status: 'waiting' | 'current_turn' | 'bid';
    bid?: number;
  }>;
  currentTurnPlayerId?: string;
  onBid: (amount: number) => Promise<void>;
  isLoading?: boolean;
  error?: string;
}

export function ContractBiddingPanel({
  trumpSuit,
  trumpWinner,
  currentContractSum,
  targetSum = 13,
  isYourTurn,
  isLastBidder,
  players,
  currentTurnPlayerId,
  onBid,
  isLoading = false,
  error,
}: ContractBiddingPanelProps) {
  const [selectedBid, setSelectedBid] = useState(0);

  const isValidBid = useCallback(() => {
    return isValidContractBid(selectedBid, currentContractSum, isLastBidder, targetSum);
  }, [selectedBid, currentContractSum, isLastBidder, targetSum]);

  const bidError = useCallback(() => {
    if (isValidBid()) return null;
    return getContractBidErrorMessage(
      selectedBid,
      currentContractSum,
      isLastBidder,
      targetSum
    );
  }, [isValidBid, selectedBid, currentContractSum, isLastBidder, targetSum]);

  const handleBid = useCallback(async () => {
    if (!isValidBid() || isLoading) return;
    try {
      await onBid(selectedBid);
      setSelectedBid(0);
    } catch (err) {
      // Error is passed via error prop
    }
  }, [isValidBid, selectedBid, onBid, isLoading]);

  const projectedSum = currentContractSum + selectedBid;

  return (
    <div className="space-y-4">
      {/* Trump info card */}
      <Card variant="elevated" className="p-4 bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Trump Suit</p>
          <div className="flex items-center justify-between">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-4xl"
            >
              {getSuitSymbol(trumpSuit)}
            </motion.span>
            <div className="text-right">
              <p className="text-xs text-gray-500">Trump Winner</p>
              <p className="text-sm font-medium text-gray-900">{trumpWinner}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Current sum display */}
      <Card variant="outlined" className="p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Sum</p>
            <p className="text-2xl font-bold text-gray-900">{currentContractSum}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Your Bid</p>
            <p className="text-2xl font-bold text-blue-600">{selectedBid}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Projected</p>
            <motion.p
              key={projectedSum}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className={`text-2xl font-bold ${
                projectedSum === targetSum && isLastBidder
                  ? 'text-red-600'
                  : 'text-gray-900'
              }`}
            >
              {projectedSum}
            </motion.p>
          </div>
        </div>
      </Card>

      {/* Your bid selection */}
      {isYourTurn && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Warning for last bidder */}
          {isLastBidder && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50 border border-amber-200 rounded px-3 py-2"
            >
              <p className="text-sm font-medium text-amber-900">
                ⚠️ Last Bidder: Cannot bid to reach {targetSum}
              </p>
            </motion.div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Bid validation message */}
          {selectedBid > 0 && bidError() && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
              <p className="text-sm text-red-700">{bidError()}</p>
            </div>
          )}

          {/* Bid counter */}
          <div className="flex justify-center">
            <BidCounter
              value={selectedBid}
              min={0}
              max={13}
              onChange={setSelectedBid}
              disabled={isLoading}
              label="Your Contract"
            />
          </div>

          {/* Confirm button */}
          <Button
            variant="primary"
            onClick={handleBid}
            disabled={!isValidBid() || isLoading}
            className="w-full"
          >
            {isLoading ? 'Confirming...' : 'Confirm Bid'}
          </Button>
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

export default ContractBiddingPanel;

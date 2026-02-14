'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  trumpWinner: _trumpWinner,
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
      selectedBid, currentContractSum, isLastBidder, targetSum
    );
  }, [isValidBid, selectedBid, currentContractSum, isLastBidder, targetSum]);

  const handleBid = useCallback(async () => {
    if (!isValidBid() || isLoading) return;
    try {
      await onBid(selectedBid);
      setSelectedBid(0);
    } catch {
      // Error is passed via error prop
    }
  }, [isValidBid, selectedBid, onBid, isLoading]);

  const projectedSum = currentContractSum + selectedBid;

  return (
    <div className="space-y-6">
      {/* Trump info — top right corner style */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">{currentContractSum}</span>
          <span className="text-sm text-muted-foreground">/ {targetSum}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground block">
            Trump
          </span>
          <span className={`text-3xl ${getSuitColorClass(trumpSuit)}`}>
            {getSuitSymbol(trumpSuit)}
          </span>
        </div>
      </div>

      {/* Your bid selection */}
      {isYourTurn && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Last bidder warning */}
          {isLastBidder && (
            <div className="bg-ochre/10 border-l-4 border-ochre px-4 py-2">
              <p className="text-xs font-semibold text-ochre uppercase tracking-[0.1em]">
                Last bidder — cannot reach {targetSum}
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-terracotta text-center">{error}</p>
          )}

          {selectedBid > 0 && bidError() && (
            <p className="text-sm text-terracotta text-center">{bidError()}</p>
          )}

          {/* Bid counter */}
          <BidCounter
            value={selectedBid}
            min={0}
            max={13}
            onChange={setSelectedBid}
            disabled={isLoading}
          />

          {/* Projected sum */}
          <div className="text-center">
            <span className={`text-sm ${
              projectedSum === targetSum && isLastBidder
                ? 'text-terracotta font-semibold'
                : 'text-muted-foreground'
            }`}>
              Projected: {projectedSum}
            </span>
          </div>

          <Button
            onClick={handleBid}
            disabled={!isValidBid() || isLoading}
            fullWidth
            size="lg"
          >
            {isLoading ? 'Confirming...' : 'Confirm'}
          </Button>
        </motion.div>
      )}

      {!isYourTurn && (
        <p className="text-center text-sm text-muted-foreground py-4 uppercase tracking-[0.1em]">
          Waiting for bid...
        </p>
      )}

      {/* Player status */}
      <PlayerBidStatus players={players} currentTurnPlayerId={currentTurnPlayerId} />
    </div>
  );
}

function getSuitSymbol(suit: TrumpSuit): string {
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', no_trump: 'NT',
  };
  return symbols[suit] || '';
}

function getSuitColorClass(suit: TrumpSuit): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'text-terracotta';
  if (suit === 'clubs' || suit === 'spades') return 'text-foreground';
  return 'text-steel';
}

export default ContractBiddingPanel;

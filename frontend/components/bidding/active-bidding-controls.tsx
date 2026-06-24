'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SuitSelector } from './suit-selector';
import { BidCounter } from './bid-counter';
import type { TrumpSuit } from '@/types/game';

export interface ActiveBiddingControlsProps {
  minimumBid: number;
  currentHighestBid: number | null;
  currentHighestSuit: TrumpSuit | null;
  onBid: (amount: number, suit: TrumpSuit) => Promise<void>;
  onPass: () => Promise<void>;
  isLoading?: boolean;
  error?: string;
}

export function ActiveBiddingControls({
  minimumBid,
  currentHighestBid,
  currentHighestSuit,
  onBid,
  onPass,
  isLoading = false,
  error,
}: ActiveBiddingControlsProps) {
  const [selectedBid, setSelectedBid] = useState(Math.max(minimumBid, (currentHighestBid || 0) + 1));
  const [selectedSuit, setSelectedSuit] = useState<TrumpSuit | null>(null);

  useEffect(() => {
    const minAllowed = Math.max(minimumBid, (currentHighestBid || 0) + 1);
    if (selectedBid < minAllowed) {
      setSelectedBid(minAllowed);
    }
  }, [minimumBid, currentHighestBid, selectedBid]);

  const isValidBid = useCallback(() => {
    if (!selectedSuit) return false;
    if (selectedBid < minimumBid) return false;
    if (selectedBid > 13) return false;

    if (currentHighestBid !== null) {
      if (selectedBid < currentHighestBid) return false;
      if (selectedBid === currentHighestBid && currentHighestSuit) {
        const currentSuitOrder = getSuitOrder(currentHighestSuit);
        const selectedSuitOrder = getSuitOrder(selectedSuit);
        if (selectedSuitOrder <= currentSuitOrder) return false;
      }
    }

    return true;
  }, [selectedBid, selectedSuit, minimumBid, currentHighestBid, currentHighestSuit]);

  const handleCall = async () => {
    if (!isValidBid() || !selectedSuit || isLoading) return;
    try {
      await onBid(selectedBid, selectedSuit);
    } catch {
      // Error handling via error prop
    }
  };

  const handlePass = async () => {
    if (isLoading) return;
    try {
      await onPass();
    } catch {
      // Error handling via error prop
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Current highest bid */}
      {currentHighestBid !== null && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-bold">{currentHighestBid}</span>
            {currentHighestSuit && (
              <span className={`text-2xl ${getSuitColorClass(currentHighestSuit)}`}>
                {getSuitSymbol(currentHighestSuit)}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-terracotta text-center">{error}</p>
      )}

      {/* Bid counter */}
      <BidCounter
        value={selectedBid}
        min={minimumBid}
        max={13}
        onChange={setSelectedBid}
        disabled={isLoading}
      />

      {/* Suit selector */}
      <SuitSelector
        value={selectedSuit}
        onChange={setSelectedSuit}
        disabled={isLoading}
      />

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="primary"
          onClick={handleCall}
          disabled={!isValidBid() || isLoading}
          fullWidth
          size="lg"
          data-testid="bidding-bid"
        >
          {isLoading ? 'Bidding...' : 'Bid'}
        </Button>
        <Button
          variant="secondary"
          onClick={handlePass}
          disabled={isLoading}
          fullWidth
          size="lg"
          data-testid="bidding-pass"
        >
          {isLoading ? 'Passing...' : 'Pass'}
        </Button>
      </div>
    </motion.div>
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

function getSuitOrder(suit: TrumpSuit): number {
  const order: Record<TrumpSuit, number> = {
    clubs: 0, diamonds: 1, hearts: 2, spades: 3, no_trump: 4,
  };
  return order[suit] ?? -1;
}

export default ActiveBiddingControls;

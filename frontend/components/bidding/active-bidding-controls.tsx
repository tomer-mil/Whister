/**
 * Active Bidding Controls Component
 * Interactive bidding interface for the active bidder
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

const SUITS: TrumpSuit[] = ['clubs', 'diamonds', 'hearts', 'spades', 'no_trump'];

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

  // Update minimum when it changes
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

    // Must outbid current highest
    if (currentHighestBid !== null) {
      if (selectedBid < currentHighestBid) return false;

      // Same amount requires higher suit
      if (selectedBid === currentHighestBid && currentHighestSuit) {
        const currentSuitOrder = getSuitOrder(currentHighestSuit);
        const selectedSuitOrder = getSuitOrder(selectedSuit);
        if (selectedSuitOrder <= currentSuitOrder) return false;
      }
    }

    return true;
  }, [selectedBid, selectedSuit, minimumBid, currentHighestBid, currentHighestSuit]);

  const handleBidChange = (delta: number) => {
    const newBid = selectedBid + delta;
    if (newBid >= minimumBid && newBid <= 13) {
      setSelectedBid(newBid);
    }
  };

  const handleCall = async () => {
    if (!isValidBid() || !selectedSuit || isLoading) return;
    try {
      await onBid(selectedBid, selectedSuit);
    } catch (err) {
      // Error handling via error prop
    }
  };

  const handlePass = async () => {
    if (isLoading) return;
    try {
      await onPass();
    } catch (err) {
      // Error handling via error prop
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <Card variant="elevated" className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <h3 className="text-lg font-bold text-gray-900 mb-3 text-center">
          📢 Your Turn to Bid
        </h3>

        {currentHighestBid !== null && (
          <div className="text-center mb-4">
            <p className="text-xs text-gray-600 mb-1">Current Highest</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{currentHighestBid}</span>
              {currentHighestSuit && (
                <span className={`text-xl ${getSuitColorClass(currentHighestSuit)}`}>
                  {getSuitSymbol(currentHighestSuit)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Bid Amount */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bid Amount
          </label>
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="secondary"
              onClick={() => handleBidChange(-1)}
              disabled={selectedBid <= minimumBid || isLoading}
              className="w-12 h-12 text-xl"
            >
              −
            </Button>
            <div className="w-20 text-center">
              <span className="text-4xl font-bold text-gray-900">{selectedBid}</span>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleBidChange(1)}
              disabled={selectedBid >= 13 || isLoading}
              className="w-12 h-12 text-xl"
            >
              +
            </Button>
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">
            Minimum: {minimumBid}
          </p>
        </div>

        {/* Suit Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Trump Suit
          </label>
          <div className="grid grid-cols-5 gap-2">
            {SUITS.map((suit) => (
              <button
                key={suit}
                onClick={() => setSelectedSuit(suit)}
                disabled={isLoading}
                className={`
                  p-3 rounded-lg border-2 transition-all
                  ${selectedSuit === suit
                    ? 'border-blue-500 bg-blue-100 shadow-md scale-105'
                    : 'border-gray-300 bg-white hover:border-blue-300 hover:shadow'
                  }
                  ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  flex items-center justify-center
                `}
              >
                <span className={`text-3xl ${getSuitColorClass(suit)}`}>
                  {getSuitSymbol(suit)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="primary"
            onClick={handleCall}
            disabled={!isValidBid() || isLoading}
            className="flex-1 py-3 text-lg font-bold"
          >
            {isLoading ? 'Calling...' : '📢 Call'}
          </Button>
          <Button
            variant="secondary"
            onClick={handlePass}
            disabled={isLoading}
            className="flex-1 py-3 text-lg"
          >
            {isLoading ? 'Passing...' : '🚫 Pass'}
          </Button>
        </div>
      </Card>
    </motion.div>
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

function getSuitColorClass(suit: TrumpSuit): string {
  if (suit === 'hearts' || suit === 'diamonds') {
    return 'text-red-600';
  }
  if (suit === 'clubs' || suit === 'spades') {
    return 'text-gray-900';
  }
  return 'text-blue-600'; // no_trump
}

function getSuitOrder(suit: TrumpSuit): number {
  const order: Record<TrumpSuit, number> = {
    clubs: 0,
    diamonds: 1,
    hearts: 2,
    spades: 3,
    no_trump: 4,
  };
  return order[suit] ?? -1;
}

export default ActiveBiddingControls;

/**
 * Waiting For Bidder Component
 * Clean waiting view for non-active players
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import type { TrumpSuit } from '@/types/game';

export interface WaitingForBidderProps {
  currentBidderName: string;
  currentHighestBid: number | null;
  currentHighestSuit: TrumpSuit | null;
  currentHighestBidderName: string | null;
}

export function WaitingForBidder({
  currentBidderName,
  currentHighestBid,
  currentHighestSuit,
  currentHighestBidderName,
}: WaitingForBidderProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Waiting message */}
      <Card variant="outlined" className="p-4 bg-gray-50">
        <div className="flex items-center justify-center gap-2">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="text-2xl"
          >
            ⏳
          </motion.span>
          <p className="text-base text-gray-700">
            Waiting for <span className="font-bold">{currentBidderName}</span> to bid...
          </p>
        </div>
      </Card>

      {/* Current highest bid display */}
      {currentHighestBid !== null ? (
        <Card variant="elevated" className="p-6 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">Current Highest Bid</p>
            <motion.div
              key={`${currentHighestBid}-${currentHighestSuit}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-5xl font-bold text-gray-900">{currentHighestBid}</span>
                {currentHighestSuit && (
                  <span className={`text-4xl ${getSuitColorClass(currentHighestSuit)}`}>
                    {getSuitSymbol(currentHighestSuit)}
                  </span>
                )}
              </div>
              {currentHighestBidderName && (
                <p className="text-sm text-gray-600">
                  by <span className="font-medium">{currentHighestBidderName}</span>
                </p>
              )}
            </motion.div>
          </div>
        </Card>
      ) : (
        <Card variant="outlined" className="p-6 bg-gray-50">
          <p className="text-center text-gray-600">No bids yet</p>
        </Card>
      )}
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

export default WaitingForBidder;

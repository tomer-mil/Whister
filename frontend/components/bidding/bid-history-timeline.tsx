/**
 * Bid History Timeline Component
 * Beautiful horizontal scrollable timeline showing all bids and passes
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import type { TrumpBid } from '@/types/store';
import type { TrumpSuit } from '@/types/game';

export interface BidHistoryTimelineProps {
  bids: TrumpBid[];
  highestBid: TrumpBid | null;
  className?: string;
}

export function BidHistoryTimeline({ bids, highestBid, className = '' }: BidHistoryTimelineProps) {
  if (bids.length === 0) {
    return (
      <Card variant="outlined" className={`p-4 ${className}`}>
        <p className="text-sm text-gray-500 text-center">No bids yet</p>
      </Card>
    );
  }

  return (
    <div className={className}>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Bid History</h3>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {bids.map((bid, index) => (
            <BidCard
              key={`${bid.playerId}-${index}`}
              bid={bid}
              isHighest={highestBid?.playerId === bid.playerId && highestBid?.timestamp === bid.timestamp && !bid.isPass}
              showArrow={index < bids.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface BidCardProps {
  bid: TrumpBid;
  isHighest: boolean;
  showArrow: boolean;
}

function BidCard({ bid, isHighest, showArrow }: BidCardProps) {
  const isPass = bid.isPass;

  // Determine card styling based on state
  const getCardClass = () => {
    if (isPass) {
      return 'bg-gray-100 border-gray-300 opacity-70';
    }
    if (isHighest) {
      return 'bg-gradient-to-br from-yellow-50 to-amber-50 border-amber-400 border-2 shadow-lg';
    }
    return 'bg-white border-gray-300 opacity-60';
  };

  return (
    <div className="flex items-center gap-2">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="relative"
      >
        <Card
          variant="outlined"
          className={`min-w-[90px] p-3 ${getCardClass()} transition-all`}
        >
          {/* Player name */}
          <div className="text-xs font-medium text-gray-700 truncate mb-1">
            {bid.playerName}
          </div>

          {/* Bid content */}
          {isPass ? (
            <div className="text-center">
              <span className="text-lg font-bold text-gray-500">PASS</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <span className={`text-2xl font-bold ${isHighest ? 'text-amber-900' : 'text-gray-700'}`}>
                {bid.amount}
              </span>
              <span className={`text-xl ${getSuitColor(bid.suit)}`}>
                {getSuitSymbol(bid.suit)}
              </span>
            </div>
          )}

          {/* Highest indicator */}
          {isHighest && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-2 -right-2 bg-amber-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow"
            >
              ★
            </motion.div>
          )}
        </Card>
      </motion.div>

      {/* Arrow between cards */}
      {showArrow && (
        <div className="text-gray-400 text-xl">→</div>
      )}
    </div>
  );
}

function getSuitSymbol(suit: TrumpSuit | null): string {
  if (!suit) return '';

  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
    no_trump: 'NT',
  };
  return symbols[suit] || '';
}

function getSuitColor(suit: TrumpSuit | null): string {
  if (!suit) return 'text-gray-700';

  if (suit === 'hearts' || suit === 'diamonds') {
    return 'text-red-600';
  }
  if (suit === 'clubs' || suit === 'spades') {
    return 'text-gray-900';
  }
  return 'text-blue-600'; // no_trump
}

export default BidHistoryTimeline;

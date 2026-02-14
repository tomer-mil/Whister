'use client';

import { motion } from 'framer-motion';
import { PlayerShape } from '@/components/ui/player-shape';
import { useStore } from '@/stores';
import type { TrumpBid } from '@/types/store';
import type { TrumpSuit } from '@/types/game';

export interface BidHistoryTimelineProps {
  bids: TrumpBid[];
  highestBid: TrumpBid | null;
  className?: string;
}

export function BidHistoryTimeline({ bids, highestBid, className = '' }: BidHistoryTimelineProps) {
  const players = useStore((state) => state.gamePlayers);

  if (bids.length === 0) {
    return (
      <p className={`text-sm text-muted-foreground text-center py-4 ${className}`}>
        No bids yet
      </p>
    );
  }

  return (
    <div className={`relative pl-6 ${className}`}>
      {/* Thick vertical bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-foreground" />

      <div className="space-y-3">
        {bids.map((bid, index) => {
          const isHighest = highestBid?.playerId === bid.playerId
            && highestBid?.timestamp === bid.timestamp
            && !bid.isPass;
          const playerIndex = players.findIndex(p => p.userId === bid.playerId);

          return (
            <motion.div
              key={`${bid.playerId}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className={`flex items-center gap-3 py-1 ${
                isHighest ? 'bg-ochre/10 -ml-6 pl-6 pr-2' : ''
              } ${bid.isPass ? 'opacity-50' : ''}`}
            >
              {/* Connector dot on the bar */}
              <div className={`absolute left-0 w-[3px] h-3 ${
                isHighest ? 'bg-ochre' : 'bg-foreground'
              }`} style={{ transform: 'translateX(-0.5px)' }} />

              <PlayerShape
                playerIndex={playerIndex >= 0 ? playerIndex : 0}
                size={16}
                filled={!bid.isPass}
                className={bid.isPass ? 'line-through' : ''}
              />

              <span className="text-xs text-muted-foreground truncate max-w-[5rem]">
                {bid.playerName}
              </span>

              {bid.isPass ? (
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em]">
                  Pass
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className={`text-lg font-bold ${isHighest ? 'text-ochre' : 'text-foreground'}`}>
                    {bid.amount}
                  </span>
                  <span className={`text-base ${getSuitColor(bid.suit)}`}>
                    {getSuitSymbol(bid.suit)}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function getSuitSymbol(suit: TrumpSuit | null): string {
  if (!suit) return '';
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', no_trump: 'NT',
  };
  return symbols[suit] || '';
}

function getSuitColor(suit: TrumpSuit | null): string {
  if (!suit) return 'text-foreground';
  if (suit === 'hearts' || suit === 'diamonds') return 'text-terracotta';
  if (suit === 'clubs' || suit === 'spades') return 'text-foreground';
  return 'text-steel';
}

export default BidHistoryTimeline;

'use client';

import { motion } from 'framer-motion';
import { PlayerShape } from '@/components/ui/player-shape';
import { useStore } from '@/stores';
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
}: WaitingForBidderProps) {
  const currentTurnPlayerId = useStore((state) => state.currentTurnPlayerId);
  const players = useStore((state) => state.gamePlayers);
  const bidderIndex = players.findIndex(p => p.userId === currentTurnPlayerId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Current bidder with rotating shape */}
      <div className="flex flex-col items-center gap-2 py-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        >
          <PlayerShape
            playerIndex={bidderIndex >= 0 ? bidderIndex : 0}
            size={40}
            filled={false}
          />
        </motion.div>
        <p className="text-sm text-muted-foreground uppercase tracking-[0.1em]">
          <span className="font-semibold text-foreground" data-testid="bidding-current-turn">{currentBidderName}</span> bidding...
        </p>
      </div>

      {/* Current highest bid */}
      {currentHighestBid !== null ? (
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl font-bold">{currentHighestBid}</span>
            {currentHighestSuit && (
              <span className={`text-3xl ${getSuitColorClass(currentHighestSuit)}`}>
                {getSuitSymbol(currentHighestSuit)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">No bids yet</p>
      )}
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

export default WaitingForBidder;

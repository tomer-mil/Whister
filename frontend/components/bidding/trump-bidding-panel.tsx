/**
 * Trump Bidding Panel Component
 * Main bidding interface during trump bidding phase
 */

'use client';

import { useStore } from '@/stores';
import { useBidding } from '@/hooks/use-bidding';
import { BidHistoryTimeline } from './bid-history-timeline';
import { ActiveBiddingControls } from './active-bidding-controls';
import { WaitingForBidder } from './waiting-for-bidder';
import { Card } from '@/components/ui/card';
import type { TrumpSuit } from '@/types/game';

export interface TrumpBiddingPanelProps {
  roomCode: string;
}

export function TrumpBiddingPanel({ roomCode }: TrumpBiddingPanelProps) {
  // Get bidding state from store
  const trumpBids = useStore((state) => state.trumpBids);
  const highestTrumpBid = useStore((state) => state.highestTrumpBid);
  const minimumBid = useStore((state) => state.minimumBid);
  const frischCount = useStore((state) => state.frischCount);
  const isMyTurn = useStore((state) => state.isMyTurn);
  const currentTurnPlayerId = useStore((state) => state.currentTurnPlayerId);
  const isSubmitting = useStore((state) => state.isSubmitting);
  const phase = useStore((state) => state.phase);
  const passedPlayers = useStore((state) => state.passedPlayers);
  const myUserId = useStore((state) => state.user?.id);
  const hasUserPassed = myUserId ? passedPlayers.has(myUserId) : false;

  // Get room players to map IDs to names
  const roomPlayers = useStore((state) => state.gamePlayers);

  // Get bidding actions
  const { bidTrump, passRound } = useBidding({ roomCode });

  // Find current bidder name
  const currentBidder = roomPlayers.find(p => p.userId === currentTurnPlayerId);
  const currentBidderName = currentBidder?.displayName || 'Unknown';

  // Handle bid placement
  const handleBid = async (amount: number, suit: TrumpSuit) => {
    try {
      await bidTrump(amount, suit);
    } catch (error) {
      console.error('Failed to place bid:', error);
      throw error;
    }
  };

  // Handle pass
  const handlePass = async () => {
    try {
      await passRound();
    } catch (error) {
      console.error('Failed to pass:', error);
      throw error;
    }
  };

  // Don't show panel if not in trump bidding phase
  if (phase !== 'trump_bidding' && phase !== 'frisch') {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Frisch indicator */}
      {frischCount > 0 && (
        <Card variant="outlined" className="p-3 bg-amber-50 border-amber-300">
          <p className="text-sm text-amber-900 text-center font-medium">
            🔄 Frisch Round {frischCount} - Minimum bid raised to {minimumBid}
          </p>
        </Card>
      )}

      {/* Bid History Timeline - always visible */}
      <BidHistoryTimeline
        bids={trumpBids}
        highestBid={highestTrumpBid}
      />

      {/* Conditional: Active controls OR waiting view */}
      {isMyTurn && !hasUserPassed ? (
        <ActiveBiddingControls
          minimumBid={minimumBid}
          currentHighestBid={highestTrumpBid?.amount || null}
          currentHighestSuit={highestTrumpBid?.suit || null}
          onBid={handleBid}
          onPass={handlePass}
          isLoading={isSubmitting}
        />
      ) : hasUserPassed ? (
        <Card variant="outlined" className="p-4 bg-gray-50">
          <p className="text-center text-muted-foreground">
            You have passed. Waiting for others...
          </p>
        </Card>
      ) : (
        <WaitingForBidder
          currentBidderName={currentBidderName}
          currentHighestBid={highestTrumpBid?.amount || null}
          currentHighestSuit={highestTrumpBid?.suit || null}
          currentHighestBidderName={highestTrumpBid?.playerName || null}
        />
      )}
    </div>
  );
}

export default TrumpBiddingPanel;

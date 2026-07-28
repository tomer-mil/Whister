'use client';

import { useStore } from '@/stores';
import { BidHistoryTimeline } from './bid-history-timeline';
import { ActiveBiddingControls } from './active-bidding-controls';
import { WaitingForBidder } from './waiting-for-bidder';
import { PhaseIndicator } from '@/components/ui/phase-indicator';
import type { TrumpSuit } from '@/types/game';

export interface TrumpBiddingPanelProps {
  roomCode: string;
  onBidTrump: (amount: number, suit: TrumpSuit) => Promise<void>;
  onPass: () => Promise<void>;
  /** Rejection reason from the server, rendered on the controls. */
  error?: string;
}

export function TrumpBiddingPanel({ roomCode: _roomCode, onBidTrump, onPass, error }: TrumpBiddingPanelProps) {
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

  const roomPlayers = useStore((state) => state.gamePlayers);

  const currentBidder = roomPlayers.find(p => p.userId === currentTurnPlayerId);
  const currentBidderName = currentBidder?.displayName || 'Unknown';

  const handleBid = async (amount: number, suit: TrumpSuit) => {
    await onBidTrump(amount, suit);
  };

  const handlePass = async () => {
    await onPass();
  };

  if (phase !== 'trump_bidding' && phase !== 'frisch') {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Phase indicator */}
      <PhaseIndicator currentPhase={1} />

      {/* Frisch indicator */}
      {frischCount > 0 && (
        <div data-testid="frisch-indicator" className="bg-ochre/10 border-l-4 border-ochre px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ochre">
              Frisch
            </span>
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 ${
                    i < frischCount ? 'bg-ochre' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Minimum bid: {minimumBid}
          </p>
        </div>
      )}

      {/* Bid history */}
      <BidHistoryTimeline
        bids={trumpBids}
        highestBid={highestTrumpBid}
      />

      {/* Active controls or waiting view */}
      {isMyTurn && !hasUserPassed ? (
        <ActiveBiddingControls
          minimumBid={minimumBid}
          currentHighestBid={highestTrumpBid?.amount || null}
          currentHighestSuit={highestTrumpBid?.suit || null}
          onBid={handleBid}
          onPass={handlePass}
          isLoading={isSubmitting}
          error={error}
        />
      ) : hasUserPassed ? (
        <p className="text-center text-sm text-muted-foreground py-4 uppercase tracking-[0.1em]">
          Passed. Waiting for others...
        </p>
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

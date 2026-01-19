/**
 * Game Screen
 * Displays the active game with conditional rendering based on phase
 */

'use client';

import { useState } from 'react';
import { useStore } from '@/stores';
import { useBidding } from '@/hooks/use-bidding';
import { GameHeader } from '@/components/game/game-header';
import { TrumpBiddingPanel } from '@/components/bidding/trump-bidding-panel';
import { ContractBiddingPanel } from '@/components/bidding/contract-bidding-panel';
import { Card } from '@/components/ui/card';

export default function GamePage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get game state
  const phase = useStore((state) => state.phase);
  const roundNumber = useStore((state) => state.currentRound);
  const totalRounds = useStore((state) => state.totalRounds);
  const trumpSuit = useStore((state) => state.trumpSuit);
  const gameType = useStore((state) => state.gameType);
  const currentUser = useStore((state) => state.user);

  // Get bidding state
  const currentTurnPlayerId = useStore((state) => state.currentTurnPlayerId);
  const highestTrumpBid = useStore((state) => state.highestTrumpBid);
  const minimumBid = useStore((state) => state.minimumBid);
  const frischCount = useStore((state) => state.frischCount);
  const trumpWinnerId = useStore((state) => state.trumpWinnerId);
  const trumpWinningBid = useStore((state) => state.trumpWinningBid);
  const contractSum = useStore((state) => state.contractSum);
  const trumpBids = useStore((state) => state.trumpBids);
  const contracts = useStore((state) => state.contracts);
  const roomPlayers = useStore((state) => state.players);

  const isYourTurn = currentTurnPlayerId === currentUser?.id;
  const isLastBidder = false; // TODO: Calculate based on round and bidding status

  // Initialize bidding hook
  const { bidTrump, passRound, bidContract } = useBidding({ roomCode: '' });

  // Handle bid actions
  const handleTrumpBid = async (amount: number, suit: string): Promise<void> => {
    setError(null);
    setIsLoading(true);
    try {
      // @ts-expect-error - suit will be TrumpSuit
      await bidTrump(amount, suit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bid');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePass = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await passRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pass');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContractBid = async (amount: number) => {
    setError(null);
    setIsLoading(true);
    try {
      await bidContract(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place contract bid');
    } finally {
      setIsLoading(false);
    }
  };

  // Transform player bids for display
  const playerBidsDisplay = roomPlayers.map((player) => {
    const status = currentTurnPlayerId === player.userId ? 'current_turn' : 'waiting';
    return {
      playerId: player.userId,
      displayName: player.displayName,
      seatPosition: player.seatPosition ?? 0,
      status: status as 'current_turn' | 'waiting',
      bid: trumpBids.find((b) => b.playerId === player.userId)?.amount,
    };
  });

  const contractBidsDisplay = roomPlayers.map((player) => {
    const status = currentTurnPlayerId === player.userId ? 'current_turn' : 'bid';
    return {
      playerId: player.userId,
      displayName: player.displayName,
      seatPosition: player.seatPosition ?? 0,
      status: status as 'current_turn' | 'bid',
      bid: contracts.find((c) => c.playerId === player.userId)?.amount,
    };
  });

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Game header */}
        <GameHeader
          roundNumber={roundNumber}
          totalRounds={totalRounds}
          trumpSuit={trumpSuit ?? undefined}
          gameType={gameType ?? undefined}
        />

        {/* Game phase content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main bidding panel */}
          <div className="lg:col-span-2">
            {phase === 'trump_bidding' && (
              <TrumpBiddingPanel
                currentSuit={highestTrumpBid?.suit ?? null}
                currentHighestBid={highestTrumpBid?.amount ?? 0}
                minimumBid={minimumBid}
                isYourTurn={isYourTurn}
                frischRound={frischCount}
                players={playerBidsDisplay}
                currentTurnPlayerId={currentTurnPlayerId ? currentTurnPlayerId : undefined}
                onBid={handleTrumpBid}
                onPass={handlePass}
                isLoading={isLoading}
                error={error || undefined}
              />
            )}

            {phase === 'contract_bidding' && trumpSuit && (
              <ContractBiddingPanel
                trumpSuit={trumpSuit}
                trumpWinner={
                  roomPlayers.find((p) => p.userId === trumpWinnerId)?.displayName ??
                  'Unknown'
                }
                currentContractSum={contractSum}
                isYourTurn={isYourTurn}
                isLastBidder={isLastBidder}
                players={contractBidsDisplay}
                currentTurnPlayerId={currentTurnPlayerId ? currentTurnPlayerId : undefined}
                onBid={handleContractBid}
                isLoading={isLoading}
                error={error || undefined}
              />
            )}

            {phase === 'playing' && (
              <Card variant="elevated" className="p-8 text-center">
                <p className="text-lg text-gray-600">
                  🎮 Game play interface coming soon...
                </p>
              </Card>
            )}

            {!['trump_bidding', 'contract_bidding', 'playing'].includes(phase) && (
              <Card variant="elevated" className="p-8 text-center">
                <p className="text-lg text-gray-600">
                  Loading game phase: {phase}
                </p>
              </Card>
            )}
          </div>

          {/* Sidebar info */}
          <div className="lg:col-span-1">
            <Card variant="outlined" className="p-4 sticky top-4">
              <h3 className="font-semibold text-gray-900 mb-4">Game Info</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Phase</p>
                  <p className="font-medium text-gray-900 capitalize">{phase}</p>
                </div>

                {trumpWinnerId && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Trump Winner</p>
                    <p className="font-medium text-gray-900">
                      {roomPlayers.find((p) => p.userId === trumpWinnerId)
                        ?.displayName || 'Unknown'}
                    </p>
                    {trumpWinningBid && (
                      <p className="text-xs text-gray-600 mt-1">Bid: {trumpWinningBid}</p>
                    )}
                  </div>
                )}

                {phase === 'contract_bidding' && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Current Sum</p>
                    <p className="font-medium text-gray-900">{contractSum} / 13</p>
                  </div>
                )}

                {currentUser && (
                  <div className="pt-3 border-t">
                    <p className="text-xs text-gray-500 uppercase">Your Status</p>
                    <p className="font-medium text-gray-900">
                      {isYourTurn ? '🎯 Your Turn' : '⏳ Waiting'}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

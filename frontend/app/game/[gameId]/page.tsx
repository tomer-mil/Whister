/**
 * Game Page
 * Main gameplay interface with phase-based rendering
 * Supports: trump bidding, contract bidding, playing, round complete
 */

'use client';

import React, { useCallback, useState } from 'react';
import { useStore } from '@/stores';
import { Card } from '@/components/ui/card';
import { ConnectionStatus } from '@/components/shared/connection-status';
// import { TrumpBiddingPanel } from '@/components/bidding/trump-bidding-panel';
import { ContractBiddingPanel } from '@/components/bidding/contract-bidding-panel';
import { TrickClaimButton } from '@/components/game/trick-claim-button';
import { AllPlayersProgress } from '@/components/game/all-players-progress';
import { AdminControls } from '@/components/game/admin-controls';
import { RoundSummaryModal } from '@/components/game/round-summary-modal';
import { useBidding } from '@/hooks/use-bidding';
import { useGame } from '@/hooks/use-game';
import type { TrumpSuit } from '@/types/game';

export default function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: _gameId } = React.use(params);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get state from store
  const {
    roomCode,
    players,
    user,
    isAdmin,
    // Bidding state
    phase,
    currentTurnPlayerId,
    trumpBids: _trumpBids,
    highestTrumpBid: _highestTrumpBid,
    minimumBid: _minimumBid,
    frischCount: _frischCount,
    trumpSuit,
    trumpWinnerId,
    trumpWinningBid: _trumpWinningBid,
    contracts,
    contractSum,
    gameType,
    isMyTurn,
    isSubmitting,
    // Game state
    currentRound,
    totalTricksPlayed,
    playerTricks,
    roundResults,
    // Actions
    setCurrentTurn: _setCurrentTurn,
  } = useStore((state) => ({
    roomCode: state.roomCode,
    players: state.players,
    user: state.user,
    isAdmin: state.isAdmin,
    // Bidding
    phase: state.phase,
    currentTurnPlayerId: state.currentTurnPlayerId,
    trumpBids: state.trumpBids,
    highestTrumpBid: state.highestTrumpBid,
    minimumBid: state.minimumBid,
    frischCount: state.frischCount,
    trumpSuit: state.trumpSuit,
    trumpWinnerId: state.trumpWinnerId,
    trumpWinningBid: state.trumpWinningBid,
    contracts: state.contracts,
    contractSum: state.contractSum,
    gameType: state.gameType,
    isMyTurn: state.isMyTurn,
    isSubmitting: state.isSubmitting,
    // Game
    currentRound: state.currentRound ?? 1,
    totalTricksPlayed: state.totalTricksPlayed ?? 0,
    playerTricks: state.playerTricks ?? {},
    roundResults: state.roundResults,
    // Actions
    setCurrentTurn: state.setCurrentTurn,
  }));

  // Get hooks for socket operations
  const { bidContract } = useBidding({ roomCode: roomCode ?? '' });
  const { claimTrick, undoTrick } = useGame({ roomCode: roomCode ?? '' });

  // Find trump winner name
  const trumpWinnerName = players.find(p => p.userId === trumpWinnerId)?.displayName ?? 'Unknown';

  // Convert players to bidding status format (unused for now - bidding UI not yet shown)
  // const getBiddingPlayerStatus = useCallback(() => {
  //   return players.map(player => {
  //     const hasBid = trumpBids.some(b => b.playerId === player.userId);
  //     const bid = trumpBids.find(b => b.playerId === player.userId);
  //     const isPassed = !hasBid && phase !== 'trump_bidding'; // Simplified check

  //     let status: 'waiting' | 'current_turn' | 'passed' | 'bid' = 'waiting';
  //     if (player.userId === currentTurnPlayerId) {
  //       status = 'current_turn';
  //     } else if (hasBid) {
  //       status = 'bid';
  //     } else if (isPassed) {
  //       status = 'passed';
  //     }

  //     return {
  //       playerId: player.userId,
  //       displayName: player.displayName,
  //       seatPosition: player.seatPosition ?? 0,
  //       status,
  //       bid: bid?.amount,
  //       suit: bid?.suit,
  //     };
  //   });
  // }, [players, trumpBids, currentTurnPlayerId, phase]);

  // Convert players to contract bidding status format
  const getContractPlayerStatus = useCallback(() => {
    return players.map(player => {
      const contract = contracts.find(c => c.playerId === player.userId);

      let status: 'waiting' | 'current_turn' | 'bid' = 'waiting';
      if (player.userId === currentTurnPlayerId) {
        status = 'current_turn';
      } else if (contract) {
        status = 'bid';
      }

      return {
        playerId: player.userId,
        displayName: player.displayName,
        seatPosition: player.seatPosition ?? 0,
        status,
        bid: contract?.amount,
      };
    });
  }, [players, contracts, currentTurnPlayerId]);

  // Convert players to progress format for playing phase
  const getPlayersProgress = useCallback(() => {
    return players.map(player => {
      const contract = contracts.find(c => c.playerId === player.userId);
      return {
        playerId: player.userId,
        playerName: player.displayName,
        tricksWon: playerTricks[player.userId] ?? 0,
        contract: contract?.amount ?? 0,
      };
    });
  }, [players, contracts, playerTricks]);

  // Check if user is last bidder in contract phase
  const isLastBidder = contracts.length === 3 && isMyTurn;

  // Handle trump bid (not used yet - bidding UI not showing)
  // const handleTrumpBid = useCallback(async (amount: number, suit: TrumpSuit) => {
  //   setError(null);
  //   try {
  //     await bidTrump(amount, suit);
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : 'Failed to place bid');
  //   }
  // }, [bidTrump]);

  // Handle pass (not used yet - bidding UI not showing)
  // const handlePass = useCallback(async () => {
  //   setError(null);
  //   try {
  //     await passRound();
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : 'Failed to pass');
  //   }
  // }, [passRound]);

  // Handle contract bid
  const handleContractBid = useCallback(async (amount: number) => {
    setError(null);
    try {
      await bidContract(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place contract bid');
    }
  }, [bidContract]);

  // Handle trick claim
  const handleClaimTrick = useCallback(async () => {
    setError(null);
    try {
      await claimTrick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim trick');
    }
  }, [claimTrick]);

  // Handle undo trick (admin only)
  const handleUndoTrick = useCallback(async (playerId: string) => {
    setError(null);
    try {
      await undoTrick(playerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo trick');
    }
  }, [undoTrick]);

  // Handle continue to next round
  const handleContinueRound = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Implement start next round API call
      // await api.post(`/rooms/${roomCode}/next-round`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start next round');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Convert round results for modal
  const getRoundResults = useCallback(() => {
    if (!roundResults) return [];
    return roundResults.map(r => ({
      playerId: r.player_id,
      playerName: r.player_name,
      contract: r.contract,
      tricksWon: r.tricks_won,
      score: r.round_score,
      made: r.made_contract,
    }));
  }, [roundResults]);

  return (
    <main className="min-h-screen pb-safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Round {currentRound}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <ConnectionStatus />
              <span className="text-xs sm:text-sm text-muted-foreground">
                Room: {roomCode}
              </span>
              {trumpSuit && (
                <span className="text-xs sm:text-sm font-medium text-primary">
                  Trump: {getTrumpSymbol(trumpSuit)}
                </span>
              )}
            </div>
          </div>
          {gameType && (
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
              gameType === 'over' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {gameType.toUpperCase()}
            </div>
          )}
        </div>
      </header>

      {/* Game Content */}
      <section className="max-w-6xl mx-auto px-4 py-6">
        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Phase: Trump Bidding */}
        {(phase === 'trump_bidding' || phase === 'frisch') && roomCode && (
          <Card variant="elevated" className="p-6 text-center">
            <h2 className="text-xl font-bold mb-2">Trump Bidding Phase</h2>
            <p className="text-muted-foreground">
              Bidding UI coming soon... (Phase 2 refactor in progress)
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Room: {roomCode} | Phase: {phase}
            </p>
          </Card>
        )}
        {/* <TrumpBiddingPanel roomCode={roomCode} /> */}

        {/* Phase: Contract Bidding */}
        {phase === 'contract_bidding' && trumpSuit && (
          <ContractBiddingPanel
            trumpSuit={trumpSuit}
            trumpWinner={trumpWinnerName}
            currentContractSum={contractSum}
            targetSum={13}
            isYourTurn={isMyTurn}
            isLastBidder={isLastBidder}
            players={getContractPlayerStatus()}
            currentTurnPlayerId={currentTurnPlayerId ?? undefined}
            onBid={handleContractBid}
            isLoading={isSubmitting}
            error={error ?? undefined}
          />
        )}

        {/* Phase: Playing */}
        {phase === 'playing' && (
          <div className="space-y-4">
            {/* Main trick claim button */}
            <TrickClaimButton
              onClaim={handleClaimTrick}
              disabled={isLoading}
              isLoading={isLoading}
            />

            {/* All players progress */}
            <AllPlayersProgress
              players={getPlayersProgress()}
              currentPlayerId={user?.id}
              totalTricksPlayed={totalTricksPlayed}
            />

            {/* Admin controls */}
            {isAdmin && (
              <AdminControls
                players={players.map(p => ({
                  playerId: p.userId,
                  playerName: p.displayName,
                }))}
                onUndoTrick={handleUndoTrick}
                canEndRound={totalTricksPlayed >= 13}
                isLoading={isLoading}
                error={error ?? undefined}
              />
            )}
          </div>
        )}

        {/* Phase: Round Complete */}
        {phase === 'complete' && (
          <Card variant="elevated" className="p-6 text-center">
            <h2 className="text-xl font-bold mb-2">Round Complete!</h2>
            <p className="text-muted-foreground">
              Waiting for round summary...
            </p>
          </Card>
        )}
      </section>

      {/* Round Summary Modal */}
      <RoundSummaryModal
        isOpen={phase === 'complete' && roundResults !== null && roundResults !== undefined}
        roundNumber={currentRound}
        results={getRoundResults()}
        onContinue={handleContinueRound}
        isLoading={isLoading}
      />
    </main>
  );
}

function getTrumpSymbol(suit: TrumpSuit): string {
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
    no_trump: 'NT',
  };
  return symbols[suit] || '';
}

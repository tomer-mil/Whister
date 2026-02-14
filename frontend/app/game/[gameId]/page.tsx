'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { ConnectionStatus } from '@/components/shared/connection-status';
import { PhaseIndicator } from '@/components/ui/phase-indicator';
import { TrumpBiddingPanel } from '@/components/bidding/trump-bidding-panel';
import { ContractBiddingPanel } from '@/components/bidding/contract-bidding-panel';
import { GameHeader } from '@/components/game/game-header';
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
  const { gameId } = React.use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading] = useState(false);

  const {
    roomCode,
    players,
    user,
    isAdmin,
    phase,
    currentTurnPlayerId,
    trumpSuit,
    trumpWinnerId,
    contracts,
    contractSum,
    gameType,
    isMyTurn,
    isSubmitting,
    currentRound,
    totalTricksPlayed,
    playerTricks,
    roundResults,
  } = useStore((state) => ({
    roomCode: state.roomCode,
    players: state.players,
    user: state.user,
    isAdmin: state.isAdmin,
    phase: state.phase,
    currentTurnPlayerId: state.currentTurnPlayerId,
    trumpSuit: state.trumpSuit,
    trumpWinnerId: state.trumpWinnerId,
    contracts: state.contracts,
    contractSum: state.contractSum,
    gameType: state.gameType,
    isMyTurn: state.isMyTurn,
    isSubmitting: state.isSubmitting,
    currentRound: state.currentRound ?? 1,
    totalTricksPlayed: state.totalTricksPlayed ?? 0,
    playerTricks: state.playerTricks ?? {},
    roundResults: state.roundResults,
  }));

  const { bidTrump, passRound, bidContract } = useBidding({ roomCode: roomCode ?? '' });
  const { claimTrick, undoTrick } = useGame({ roomCode: roomCode ?? '' });

  const trumpWinnerName = players.find(p => p.userId === trumpWinnerId)?.displayName ?? 'Unknown';

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

  const getDashboardPlayers = useCallback(() => {
    return players.map((player, index) => {
      const contract = contracts.find(c => c.playerId === player.userId);
      return {
        playerId: player.userId,
        playerName: player.displayName,
        tricksWon: playerTricks[player.userId] ?? 0,
        contract: contract?.amount ?? 0,
        seatIndex: index,
      };
    });
  }, [players, contracts, playerTricks]);

  const isLastBidder = contracts.length === 3 && isMyTurn;

  const handleContractBid = useCallback(async (amount: number) => {
    setError(null);
    try {
      await bidContract(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place contract bid');
    }
  }, [bidContract]);

  const handleClaimTrick = useCallback(async () => {
    setError(null);
    try {
      await claimTrick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim trick');
    }
  }, [claimTrick]);

  const handleUndoTrick = useCallback(async (playerId: string) => {
    setError(null);
    try {
      await undoTrick(playerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo trick');
    }
  }, [undoTrick]);

  const handleContinueRound = useCallback(() => {
    router.push(`/game/${gameId}/scores`);
  }, [router, gameId]);

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

  const getPhaseIndex = () => {
    if (phase === 'seating') return 0;
    if (phase === 'trump_bidding' || phase === 'frisch' || phase === 'contract_bidding') return 1;
    return 2;
  };

  return (
    <main className="min-h-screen flex flex-col pb-safe-bottom">
      {/* Subtle top info */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-[0.1em]">
            {roomCode}
          </span>
          {gameType && (
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground">
              {gameType}
            </span>
          )}
        </div>
        <ConnectionStatus />
      </div>

      {/* Phase indicator */}
      <PhaseIndicator currentPhase={getPhaseIndex()} />

      {/* Error display */}
      {error && (
        <p className="text-sm text-terracotta text-center px-4 py-2">{error}</p>
      )}

      {/* Phase: Trump Bidding */}
      {(phase === 'trump_bidding' || phase === 'frisch') && roomCode && (
        <section className="flex-1 px-4 py-4">
          <TrumpBiddingPanel
            roomCode={roomCode}
            onBidTrump={bidTrump}
            onPass={passRound}
          />
        </section>
      )}

      {/* Phase: Contract Bidding */}
      {phase === 'contract_bidding' && trumpSuit && (
        <section className="flex-1 px-4 py-4">
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
        </section>
      )}

      {/* Phase: Playing */}
      {phase === 'playing' && (
        <>
          {/* Dashboard strip */}
          <GameHeader
            roundNumber={currentRound}
            totalRounds={13}
            trumpSuit={trumpSuit ?? undefined}
            players={getDashboardPlayers()}
            currentUserId={user?.id}
          />

          <section className="flex-1 px-4 py-4 space-y-4">
            {/* Large claim trick button */}
            <TrickClaimButton
              onClaim={handleClaimTrick}
              disabled={isLoading}
              isLoading={isLoading}
            />

            {/* Progress */}
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
          </section>
        </>
      )}

      {/* Phase: Round Complete */}
      {phase === 'complete' && (
        <section className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-muted-foreground uppercase tracking-[0.1em]">
            Round complete
          </p>
        </section>
      )}

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

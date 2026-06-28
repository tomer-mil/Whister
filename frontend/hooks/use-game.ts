/**
 * useGame Hook
 * Manages game state and WebSocket subscriptions for gameplay
 */

import { useCallback, useEffect } from 'react';
import { useSocket } from './use-socket';
import { useStore } from '@/stores';
import type { GameStatus, RoundPhase } from '@/types/game';
import type {
  RoundTrickWonPayload,
  RoundTrickUndonePayload,
  RoundCompletePayload,
  SyncStatePayload,
} from '@/types/socket-events';

export interface UseGameOptions {
  roomCode: string;
}

const syncPhaseMap: Record<GameStatus, RoundPhase | null> = {
  waiting: null,
  seating: null,
  bidding_trump: 'trump_bidding',
  frisch: 'frisch',
  bidding_contract: 'contract_bidding',
  playing: 'playing',
  round_complete: 'complete',
  finished: null,
};

/**
 * Hook for game phase management and trick claiming
 */
export function useGame(options: UseGameOptions) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true });

  // Get game state and actions from store
  const updatePlayer = useStore((state) => state.updatePlayer);
  const addRoundScore = useStore((state) => state.addRoundScore);
  const setGameState = useStore((state) => state.setGameState);
  const updatePlayerTricks = useStore((state) => state.updatePlayerTricks);
  // const incrementTotalTricks = useStore((state) => state.incrementTotalTricks);
  const setRoundResults = useStore((state) => state.setRoundResults);
  const setPhase = useStore((state) => state.setPhase);
  const setCurrentTurn = useStore((state) => state.setCurrentTurn);

  // Claim a trick - uses backend event name round:claim_trick
  const claimTrick = useCallback(async () => {
    const response = await emit('round:claim_trick', { room_code: roomCode });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to claim trick');
    }
  }, [emit, roomCode]);

  // Undo last trick claim (admin only) - uses backend event name round:undo_trick
  const undoTrick = useCallback(
    async (playerId: string) => {
      const response = await emit('round:undo_trick', { room_code: roomCode, player_id: playerId });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to undo trick');
      }
    },
    [emit, roomCode]
  );

  // Subscribe to game events using backend event names
  useEffect(() => {
    if (!socket) return;

    // Trick won - backend sends round:trick_won
    socket.on('round:trick_won', (payload: RoundTrickWonPayload) => {
      // Update player tricks in game state
      updatePlayerTricks(payload.player_id, payload.new_trick_count);

      // Update game state with new total tricks
      setGameState({
        totalTricksPlayed: payload.total_tricks_played,
      });

      // Also update game player for backwards compatibility
      updatePlayer(payload.player_id, {
        tricksWon: payload.new_trick_count,
      });
    });

    // Trick undone - backend sends round:trick_undone
    socket.on('round:trick_undone', (payload: RoundTrickUndonePayload) => {
      updatePlayerTricks(payload.player_id, payload.new_trick_count);
      setGameState({
        totalTricksPlayed: payload.total_tricks_played,
      });
      updatePlayer(payload.player_id, {
        tricksWon: payload.new_trick_count,
      });
    });

    // Round complete with results - backend sends round:complete
    socket.on('round:complete', (payload: RoundCompletePayload) => {
      // Store round results for the modal
      // TODO: Backend needs to send full PlayerRoundResult[] with tricks_won, round_score, made_contract
      setRoundResults(payload.players as any);

      // Update phase to complete
      setPhase('complete');

      // Map results to scores format for scores slice
      if (payload.cumulative_scores) {
        const roundScore = payload.cumulative_scores.map((score) => {
          const playerResult = payload.players.find((p) => p.player_id === score.player_id);
          return {
            playerId: score.player_id,
            displayName: score.player_name,
            seatPosition: playerResult?.seat_position ?? 0,
            contractBid: playerResult?.contract ?? 0,
            tricksWon: playerResult?.tricks_won ?? 0,
            score: score.round_score,
            madeContract: playerResult?.made_contract ?? false,
            cumulativeScore: score.total_score,
          };
        });

        addRoundScore({
          roundNumber: payload.round_number,
          trumpSuit: payload.trump_suit as any,
          gameType: payload.game_type as any,
          trumpWinnerId: '', // Will be populated from game state
          playerScores: roundScore,
          commentary: [], // Backend doesn't send commentary
        });
      }

      setGameState({
        status: 'round_complete' as any,
      });
    });

    // Sync state rehydration - backend sends sync:state in response to sync:request
    socket.on('sync:state', (payload: SyncStatePayload) => {
      const frontendPhase = syncPhaseMap[payload.phase];
      if (frontendPhase) setPhase(frontendPhase);

      // Update current bidder if in a bidding phase
      if (payload.current_bidder) {
        setCurrentTurn(payload.current_bidder);
      }

      // Rehydrate trick counts if in playing phase
      if (payload.phase === 'playing') {
        const tricks = (payload.additional_data?.tricks ?? {}) as Record<string, number>;
        Object.entries(tricks).forEach(([userId, count]) => {
          updatePlayerTricks(userId, count);
        });
      }
    });

    return () => {
      socket.off('round:trick_won');
      socket.off('round:trick_undone');
      socket.off('round:complete');
      socket.off('sync:state');
    };
  }, [socket, updatePlayer, addRoundScore, setGameState, updatePlayerTricks, setRoundResults, setPhase, setCurrentTurn]);

  // Emit sync:request when the tab returns to visible so the server can push
  // current state without waiting for the next server-initiated event.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        emit('sync:request', { room_code: roomCode }).catch(() => {
          // Best-effort; sync:state handler will update store if it arrives
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [emit, roomCode]);

  // Emit sync:request whenever the socket instance changes (i.e. on reconnect
  // after a reload, PWA relaunch, or network interruption).  This intentionally
  // overlaps with the visibilitychange listener above for the case where the
  // socket reconnects while the tab is already visible — the server handler is
  // idempotent (read-only, just re-sends current state) so the double-emit on
  // a normal foreground load is harmless and ensures stale state is never
  // displayed after a reconnect cycle.
  useEffect(() => {
    if (!socket || !roomCode) return;
    emit('sync:request', { room_code: roomCode }).catch(() => {
      // Best-effort; room:joined remains the fallback state source.
    });
  }, [socket, emit, roomCode]);

  return {
    socket,
    emit,
    claimTrick,
    undoTrick,
  };
}

export default useGame;

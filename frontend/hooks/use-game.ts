/**
 * useGame Hook
 * Manages game state and WebSocket subscriptions for gameplay
 */

import { useCallback, useEffect } from 'react';
import { useSocket } from './use-socket';
import { useStore } from '@/stores';
import type {
  TrickClaimedPayload,
  RoundCompletePayload,
} from '@/types/socket-events';

export interface UseGameOptions {
  roomCode?: string;
}

/**
 * Hook for game phase management and trick claiming
 */
export function useGame(options: UseGameOptions = {}) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true, roomCode });

  // Get game state from store
  const updatePlayer = useStore((state) => state.updatePlayer);
  const addRoundScore = useStore((state) => state.addRoundScore);
  const setGameState = useStore((state) => state.setGameState);

  // Claim a trick
  const claimTrick = useCallback(async () => {
    const response = await emit('game:claim_trick', {});
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to claim trick');
    }
  }, [emit]);

  // Undo last trick claim (admin only)
  const undoTrick = useCallback(
    async (playerId: string) => {
      const response = await emit('game:undo_trick', { player_id: playerId });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to undo trick');
      }
    },
    [emit]
  );

  // End current round (admin only)
  const endRound = useCallback(async () => {
    const response = await emit('game:end_round', {});
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to end round');
    }
  }, [emit]);

  // Subscribe to game events
  useEffect(() => {
    if (!socket) return;

    // Trick claimed
    socket.on('game:trick_claimed', (payload: TrickClaimedPayload) => {
      updatePlayer(payload.player_id, {
        tricksWon: payload.new_trick_count,
      });
    });

    // Round complete with results
    socket.on('game:round_complete', (payload: RoundCompletePayload) => {
      const roundScore = payload.players.map((p) => ({
        playerId: p.player_id,
        displayName: p.display_name,
        seatPosition: p.seat_position,
        contractBid: p.contract_bid,
        tricksWon: p.tricks_won,
        score: p.score,
        madeContract: p.made_contract,
        cumulativeScore: p.cumulative_score,
      }));

      addRoundScore({
        roundNumber: payload.round_number,
        trumpSuit: payload.trump_suit,
        gameType: payload.game_type,
        trumpWinnerId: '', // Will be populated from game state
        playerScores: roundScore,
        commentary: payload.commentary,
      });

      setGameState({
        status: 'round_complete' as any,
      });
    });

    return () => {
      socket.off('game:trick_claimed');
      socket.off('game:round_complete');
    };
  }, [socket, updatePlayer, addRoundScore, setGameState]);

  return {
    socket,
    emit,
    claimTrick,
    undoTrick,
    endRound,
  };
}

export default useGame;

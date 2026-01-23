/**
 * useGame Hook
 * Manages game state and WebSocket subscriptions for gameplay
 */

import { useCallback, useEffect } from 'react';
import { useSocket } from './use-socket';
import { useStore } from '@/stores';
import type {
  RoundTrickWonPayload,
  RoundCompletePayload,
} from '@/types/socket-events';

export interface UseGameOptions {
  roomCode: string;
}

/**
 * Hook for game phase management and trick claiming
 */
export function useGame(options: UseGameOptions) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true, roomCode });

  // Get game state from store
  const updatePlayer = useStore((state) => state.updatePlayer);
  const addRoundScore = useStore((state) => state.addRoundScore);
  const setGameState = useStore((state) => state.setGameState);

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
      updatePlayer(payload.player_id, {
        tricksWon: payload.new_trick_count,
      });
    });

    // Round complete with results - backend sends round:complete
    socket.on('round:complete', (payload: RoundCompletePayload) => {
      // Map cumulative_scores to player scores format
      const roundScore = payload.cumulative_scores.map((score) => ({
        playerId: score.player_id,
        displayName: score.player_name,
        seatPosition: payload.players.find((p) => p.player_id === score.player_id)?.seat_position ?? 0,
        contractBid: payload.players.find((p) => p.player_id === score.player_id)?.amount ?? 0,
        tricksWon: 0, // Not provided in backend payload - would need to track separately
        score: score.round_score,
        madeContract: true, // Not provided in backend payload
        cumulativeScore: score.total_score,
      }));

      addRoundScore({
        roundNumber: payload.round_number,
        trumpSuit: payload.trump_suit,
        gameType: payload.game_type,
        trumpWinnerId: '', // Will be populated from game state
        playerScores: roundScore,
        commentary: [], // Backend doesn't send commentary
      });

      setGameState({
        status: 'round_complete' as any,
      });
    });

    return () => {
      socket.off('round:trick_won');
      socket.off('round:complete');
    };
  }, [socket, updatePlayer, addRoundScore, setGameState]);

  return {
    socket,
    emit,
    claimTrick,
    undoTrick,
  };
}

export default useGame;

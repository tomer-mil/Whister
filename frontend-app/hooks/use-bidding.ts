/**
 * useBidding Hook
 * Manages bidding WebSocket subscriptions and actions
 */

import { useCallback } from 'react';
import { useSocket } from './use-socket';
import type { TrumpSuit } from '@/types/game';

export interface UseBiddingOptions {
  roomCode?: string;
}

/**
 * Hook for bidding phase management and WebSocket integration
 */
export function useBidding(options: UseBiddingOptions = {}) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true, roomCode });

  // Client-side bid emission
  const bidTrump = useCallback(
    async (amount: number, suit: TrumpSuit) => {
      const response = await emit('bid:trump', { amount, suit });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to place bid');
      }
    },
    [emit]
  );

  const passRound = useCallback(async () => {
    const response = await emit('bid:pass', {});
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to pass');
    }
  }, [emit]);

  const bidContract = useCallback(
    async (amount: number) => {
      const response = await emit('bid:contract', { amount });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to place contract bid');
      }
    },
    [emit]
  );

  return {
    socket,
    emit,
    bidTrump,
    passRound,
    bidContract,
  };
}

export default useBidding;

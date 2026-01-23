/**
 * useBidding Hook
 * Manages bidding WebSocket subscriptions and actions
 */

import { useCallback } from 'react';
import { useSocket } from './use-socket';
import type { TrumpSuit } from '@/types/game';

export interface UseBiddingOptions {
  roomCode: string;
}

/**
 * Hook for bidding phase management and WebSocket integration
 */
export function useBidding(options: UseBiddingOptions) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true, roomCode });

  // Client-side bid emission - all events require room_code per backend schemas
  const bidTrump = useCallback(
    async (amount: number, suit: TrumpSuit) => {
      const response = await emit('bid:trump', { room_code: roomCode, amount, suit });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to place bid');
      }
    },
    [emit, roomCode]
  );

  const passRound = useCallback(async () => {
    const response = await emit('bid:pass', { room_code: roomCode });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to pass');
    }
  }, [emit, roomCode]);

  const bidContract = useCallback(
    async (amount: number) => {
      const response = await emit('bid:contract', { room_code: roomCode, amount });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to place contract bid');
      }
    },
    [emit, roomCode]
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

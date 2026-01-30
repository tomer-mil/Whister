/**
 * useBidding Hook
 * Manages bidding WebSocket subscriptions and actions
 */

import { useCallback, useEffect } from 'react';
import { useSocket } from './use-socket';
import { useStore } from '@/stores';
import type { TrumpSuit } from '@/types/game';
import type {
  BidPlacedPayload,
  BidPassedPayload,
  BidTrumpSetPayload,
  BidFrischStartedPayload,
  BidContractsSetPayload,
  YourTurnPayload,
} from '@/types/socket-events';

export interface UseBiddingOptions {
  roomCode: string;
}

/**
 * Hook for bidding phase management and WebSocket integration
 */
export function useBidding(options: UseBiddingOptions) {
  const { roomCode } = options;
  const { socket, emit } = useSocket({ autoConnect: true });

  // Get store actions
  const addTrumpBid = useStore((state) => state.addTrumpBid);
  const addPass = useStore((state) => state.addPass);
  const setCurrentTurn = useStore((state) => state.setCurrentTurn);
  const setTrumpResult = useStore((state) => state.setTrumpResult);
  const setFrisch = useStore((state) => state.setFrisch);
  const setContracts = useStore((state) => state.setContracts);
  const addContract = useStore((state) => state.addContract);
  const setContractsComplete = useStore((state) => state.setContractsComplete);
  const setPhase = useStore((state) => state.setPhase);

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

  // Subscribe to bidding events
  useEffect(() => {
    if (!socket) return;

    // Your turn notification
    socket.on('bid:your_turn', (_payload: YourTurnPayload) => {
      // This event is sent only to the player whose turn it is
      const myUserId = useStore.getState().user?.id;
      if (myUserId) {
        setCurrentTurn(myUserId);
        console.log('[useBidding] Received bid:your_turn, setting isMyTurn=true');
      }
    });

    // Trump bid placed
    socket.on('bid:placed', (payload: BidPlacedPayload) => {
      console.log('[useBidding] Received bid:placed', payload);
      // Add the bid to store
      if (payload.bid && !payload.bid.is_pass) {
        addTrumpBid({
          playerId: payload.bid.player_id,
          playerName: payload.bid.player_name,
          amount: payload.bid.amount,
          suit: payload.bid.suit as TrumpSuit,
          isPass: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Update current turn
      if (payload.next_bidder_id) {
        setCurrentTurn(payload.next_bidder_id);
      }
    });

    // Player passed
    socket.on('bid:passed', (payload: BidPassedPayload) => {
      // Add pass to bid history
      addPass(payload.player_id, payload.player_name);

      // Update current turn to next bidder
      if (payload.next_bidder_id) {
        setCurrentTurn(payload.next_bidder_id);
      }
    });

    // Trump bidding complete - winner determined
    socket.on('bid:trump_set', (payload: BidTrumpSetPayload) => {
      setTrumpResult(
        payload.winner_id,
        payload.winner_name,
        payload.winning_bid,
        payload.trump_suit as TrumpSuit
      );
      // Phase transition to contract_bidding is handled by setTrumpResult
    });

    // Frisch triggered - all players passed
    socket.on('bid:frisch_started', (payload: BidFrischStartedPayload) => {
      setFrisch(payload.frisch_number, payload.new_minimum_bid);
      // Update current turn to first bidder
      if (payload.first_bidder_id) {
        setCurrentTurn(payload.first_bidder_id);
      }
    });

    // All contracts placed - game type determined
    socket.on('bid:contracts_set', (payload: BidContractsSetPayload) => {
      // Store all contracts
      const contracts = payload.contracts.map(c => ({
        playerId: c.player_id,
        playerName: c.player_name,
        seatPosition: c.seat_position,
        amount: c.amount,
        timestamp: new Date().toISOString(),
      }));
      setContracts(contracts);

      // Set game type and transition to playing phase
      setContractsComplete(payload.game_type as 'over' | 'under');
    });

    return () => {
      socket.off('bid:your_turn');
      socket.off('bid:placed');
      socket.off('bid:passed');
      socket.off('bid:trump_set');
      socket.off('bid:frisch_started');
      socket.off('bid:contracts_set');
    };
  }, [socket, addTrumpBid, addPass, setCurrentTurn, setTrumpResult, setFrisch, setContracts, addContract, setContractsComplete, setPhase]);

  return {
    socket,
    emit,
    bidTrump,
    passRound,
    bidContract,
  };
}

export default useBidding;

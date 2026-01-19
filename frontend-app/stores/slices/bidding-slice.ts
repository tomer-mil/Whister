/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  BiddingState,
  BiddingActions,
  TrumpBid,
  ContractBid,
} from '@/types/store';
import type { RoundPhase } from '@/types/game';

export interface BiddingSlice extends BiddingState, BiddingActions {}

const initialBiddingState: BiddingState = {
  phase: 'trump_bidding',
  currentTurnPlayerId: null,

  trumpBids: [],
  highestTrumpBid: null,
  minimumBid: 5,
  consecutivePasses: 0,
  frischCount: 0,

  contracts: [],
  contractSum: 0,
  trumpWinnerId: null,
  trumpWinningBid: null,
  trumpSuit: null,
  gameType: null,

  isMyTurn: false,
  isSubmitting: false,
};

export const createBiddingSlice: any = (set: any, get: any) => ({
  ...initialBiddingState,

  placeTrumpBid: async (amount, suit) => {
    set({ isSubmitting: true });
    try {
      // TODO: Implement Socket.IO emit to bid:trump
      // const socket = getSocket();
      // await new Promise((resolve, reject) => {
      //   socket.emit('bid:trump', { amount, suit }, (response: { success: boolean; error?: string }) => {
      //     if (response.success) resolve();
      //     else reject(new Error(response.error));
      //   });
      // });

      // Mock implementation - just add the bid
      const newBid: TrumpBid = {
        playerId: get().user?.id ?? 'unknown',
        playerName: get().user?.displayName ?? 'Unknown',
        amount,
        suit,
        timestamp: new Date().toISOString(),
      };

      set({ isSubmitting: false });
      get().addTrumpBid(newBid);
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },

  passTrumpBid: async () => {
    set({ isSubmitting: true });
    try {
      // TODO: Implement Socket.IO emit to bid:pass
      // const socket = getSocket();
      // await new Promise((resolve, reject) => {
      //   socket.emit('bid:pass', {}, (response: { success: boolean; error?: string }) => {
      //     if (response.success) resolve();
      //     else reject(new Error(response.error));
      //   });
      // });

      set((state) => ({
        consecutivePasses: state.consecutivePasses + 1,
        isSubmitting: false,
      }));
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },

  placeContractBid: async (amount) => {
    set({ isSubmitting: true });
    try {
      // TODO: Implement Socket.IO emit to bid:contract
      // const socket = getSocket();
      // await new Promise((resolve, reject) => {
      //   socket.emit('bid:contract', { amount }, (response: { success: boolean; error?: string }) => {
      //     if (response.success) resolve();
      //     else reject(new Error(response.error));
      //   });
      // });

      const newContract: ContractBid = {
        playerId: get().user?.id ?? 'unknown',
        playerName: get().user?.displayName ?? 'Unknown',
        seatPosition: 0, // TODO: Get from game state
        amount,
        timestamp: new Date().toISOString(),
      };

      set({ isSubmitting: false });
      get().addContract(newContract);
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },

  setPhase: (phase) => set({ phase }),

  setTrumpBids: (bids) => {
    const highestBid = bids.length > 0 ? bids[bids.length - 1] : null;
    set({
      trumpBids: bids,
      highestTrumpBid: highestBid,
    });
  },

  addTrumpBid: (bid) => {
    set((state) => ({
      trumpBids: [...state.trumpBids, bid],
      highestTrumpBid: bid,
      consecutivePasses: 0,
    }));
  },

  setTrumpResult: (winnerId, bid, suit) => {
    set({
      trumpWinnerId: winnerId,
      trumpWinningBid: bid,
      trumpSuit: suit,
      phase: 'contract_bidding' as RoundPhase,
    });
  },

  setFrisch: (frischCount, minimumBid) => {
    set({
      frischCount,
      minimumBid,
      phase: 'frisch' as RoundPhase,
      trumpBids: [],
      highestTrumpBid: null,
      consecutivePasses: 0,
    });
  },

  setContracts: (contracts) => {
    const sum = contracts.reduce((acc, c) => acc + c.amount, 0);
    set({ contracts, contractSum: sum });
  },

  addContract: (contract) => {
    set((state) => ({
      contracts: [...state.contracts, contract],
      contractSum: state.contractSum + contract.amount,
    }));
  },

  setContractsComplete: (gameType) => {
    set({
      gameType,
      phase: 'playing' as RoundPhase,
    });
  },

  setCurrentTurn: (playerId) => {
    const myId = get().user?.id;
    set({
      currentTurnPlayerId: playerId,
      isMyTurn: playerId === myId,
    });
  },

  resetBidding: () => set(initialBiddingState),
});

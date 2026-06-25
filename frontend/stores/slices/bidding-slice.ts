/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  BiddingState,
  BiddingActions,
  TrumpBid,
  ContractBid,
} from '@/types/store';
import type { RoundPhase, TrumpSuit } from '@/types/game';

export interface BiddingSlice extends BiddingState, BiddingActions {}

const initialBiddingState: BiddingState = {
  phase: 'trump_bidding',
  currentTurnPlayerId: null,

  // Trump bidding
  trumpBids: [],
  highestTrumpBid: null,
  passedPlayers: new Set<string>(),
  minimumBid: 5,
  consecutivePasses: 0,
  frischCount: 0,

  // Contract bidding
  contracts: [],
  contractSum: 0,
  trumpWinnerId: null,
  trumpWinnerName: null,
  trumpWinningBid: null,
  trumpSuit: null,
  gameType: null,

  // UI state
  isMyTurn: false,
  isLastBidder: false,
  isSubmitting: false,
};

export const createBiddingSlice: any = (set: any, get: any) => ({
  ...initialBiddingState,

  placeTrumpBid: async (_amount: number, _suit: TrumpSuit) => {
    set({ isSubmitting: true });
    try {
      // This is now handled by use-bidding hook
      // Just set submitting state here
      set({ isSubmitting: false });
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },

  passTrumpBid: async () => {
    set({ isSubmitting: true });
    try {
      // This is now handled by use-bidding hook
      set({ isSubmitting: false });
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },

  placeContractBid: async (_amount: number) => {
    set({ isSubmitting: true });
    try {
      // This is now handled by use-bidding hook
      set({ isSubmitting: false });
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },

  setPhase: (phase: RoundPhase) => set({ phase }),

  setTrumpBids: (bids: TrumpBid[]) => {
    // Find highest non-pass bid
    const highestBid = [...bids]
      .reverse()
      .find(b => !b.isPass) || null;

    // Build passed players set from history
    const passedPlayers = new Set(
      bids
        .filter(b => b.isPass)
        .map(b => b.playerId)
    );

    set({
      trumpBids: bids,
      highestTrumpBid: highestBid,
      passedPlayers,
    });
  },

  addTrumpBid: (bid: TrumpBid) => {
    set((state: BiddingState) => {
      const newBids = [...state.trumpBids, bid];
      const newHighest = bid.isPass ? state.highestTrumpBid : bid;
      console.log('[BiddingSlice] Adding trump bid, new highest:', newHighest);
      return {
        trumpBids: newBids,
        highestTrumpBid: newHighest,
        consecutivePasses: 0,
      };
    });
  },

  addPass: (playerId: string, playerName: string) => {
    const passBid: TrumpBid = {
      playerId,
      playerName,
      amount: 0,
      suit: null,
      isPass: true,
      timestamp: new Date().toISOString(),
    };

    set((state: BiddingState) => {
      const newPassedPlayers = new Set(state.passedPlayers);
      newPassedPlayers.add(playerId);

      return {
        trumpBids: [...state.trumpBids, passBid],
        passedPlayers: newPassedPlayers,
        consecutivePasses: state.consecutivePasses + 1,
      };
    });
  },

  setTrumpResult: (winnerId: string, winnerName: string, bid: number, suit: TrumpSuit) => {
    set({
      trumpWinnerId: winnerId,
      trumpWinnerName: winnerName,
      trumpWinningBid: bid,
      trumpSuit: suit,
      phase: 'contract_bidding' as RoundPhase,
    });
  },

  setFrisch: (frischCount: number, minimumBid: number) => {
    set({
      frischCount,
      minimumBid,
      phase: 'frisch' as RoundPhase,
      trumpBids: [],
      highestTrumpBid: null,
      passedPlayers: new Set<string>(),
      consecutivePasses: 0,
    });
  },

  setContracts: (contracts: ContractBid[]) => {
    const sum = contracts.reduce((acc, c) => acc + c.amount, 0);
    set({ contracts, contractSum: sum });
  },

  addContract: (contract: ContractBid) => {
    set((state: BiddingState) => ({
      contracts: [...state.contracts, contract],
      contractSum: state.contractSum + contract.amount,
    }));
  },

  setContractsComplete: (gameType: 'over' | 'under') => {
    set({
      gameType,
      phase: 'playing' as RoundPhase,
    });
  },

  setCurrentTurn: (playerId: string, isLastBidder?: boolean) => {
    const myId = get().user?.id;
    const isMyTurn = playerId === myId;
    set({
      currentTurnPlayerId: playerId,
      isMyTurn,
      isLastBidder: isMyTurn ? (isLastBidder ?? false) : false,
    });
  },

  resetBidding: () => set({
    ...initialBiddingState,
    passedPlayers: new Set<string>(), // Reset to new Set instance
  }),
});

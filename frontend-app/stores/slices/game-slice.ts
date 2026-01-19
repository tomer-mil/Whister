/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameState, GameActions, GamePlayer } from '@/types/store';
import type { GameStatus } from '@/types/game';

export interface GameSlice extends GameState, GameActions {}

const initialGameState: GameState = {
  gameId: null,
  status: 'waiting',
  currentRound: 1,
  totalRounds: 13,
  gamePlayers: [],
  myPlayerId: null,
};

export const createGameSlice: any = (set: any, get: any) => ({
  ...initialGameState,

  startGame: async () => {
    try {
      // TODO: Implement API call to POST /games/start
      // const response = await apiClient.post('/games/start', { room_id: get().roomId });
      // const { game_id } = response.data;

      // Mock implementation
      const mockGameId = 'game-' + Math.random().toString(36).substr(2, 9);
      const roomPlayers = get().players;
      const myUserId = get().user?.id;

      const gamePlayers: GamePlayer[] = roomPlayers
        .filter((p) => p.seatPosition !== null)
        .map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          seatPosition: p.seatPosition ?? 0,
          contractBid: null,
          tricksWon: 0,
          score: null,
          isConnected: p.isConnected,
        }));

      set({
        gameId: mockGameId,
        status: 'bidding_trump' as GameStatus,
        currentRound: 1,
        totalRounds: 13,
        gamePlayers,
        myPlayerId: myUserId ?? null,
      });
    } catch (error) {
      throw error;
    }
  },

  setGameState: (state) => {
    set((currentState) => ({
      ...currentState,
      ...state,
    }));
  },

  updatePlayer: (playerId, data) => {
    set((state) => ({
      gamePlayers: state.gamePlayers.map((p) =>
        p.userId === playerId ? { ...p, ...data } : p
      ),
    }));
  },

  resetGame: () => set(initialGameState),
});

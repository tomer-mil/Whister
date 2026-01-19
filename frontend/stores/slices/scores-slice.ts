/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ScoresState,
  ScoresActions,
  PlayerTotal,
} from '@/types/store';

export interface ScoresSlice extends ScoresState, ScoresActions {}

const initialScoresState: ScoresState = {
  rounds: [],
  playerTotals: [],
  isLoading: false,
};

export const createScoresSlice: any = (set: any, get: any) => ({
  ...initialScoresState,

  addRoundScore: (round) => {
    set((state) => ({
      rounds: [...state.rounds, round],
    }));
    get().calculateTotals();
  },

  setRounds: (rounds) => {
    set({ rounds });
    get().calculateTotals();
  },

  updateRound: (roundNumber, data) => {
    set((state) => ({
      rounds: state.rounds.map((r) =>
        r.roundNumber === roundNumber ? { ...r, ...data } : r
      ),
    }));
    get().calculateTotals();
  },

  calculateTotals: () => {
    const rounds = get().rounds;
    const gamePlayerIds = get().players.map((p) => p.userId);

    // Calculate totals for each player
    const totalsMap = new Map<string, PlayerTotal>();

    gamePlayerIds.forEach((playerId) => {
      totalsMap.set(playerId, {
        playerId,
        displayName: '',
        totalScore: 0,
        rank: 0,
        roundsWon: 0,
        perfectRounds: 0,
      });
    });

    // Sum scores from all rounds
    rounds.forEach((round) => {
      round.playerScores.forEach((playerScore) => {
        const total = totalsMap.get(playerScore.playerId);
        if (total) {
          total.totalScore += playerScore.score;
          total.displayName = playerScore.displayName;

          // Count rounds won (positive score)
          if (playerScore.score > 0) {
            total.roundsWon += 1;
          }

          // Count perfect rounds (made contract exactly)
          if (
            playerScore.madeContract &&
            playerScore.tricksWon === playerScore.contractBid
          ) {
            total.perfectRounds += 1;
          }
        }
      });
    });

    // Convert to array and sort by score descending
    const playerTotals = Array.from(totalsMap.values()).sort(
      (a, b) => b.totalScore - a.totalScore
    );

    // Assign ranks
    playerTotals.forEach((total, index) => {
      total.rank = index + 1;
    });

    set({ playerTotals });
  },

  fetchScores: async () => {
    set({ isLoading: true });
    try {
      // TODO: Implement API call to GET /games/{gameId}/scores
      // const response = await apiClient.get(`/games/${gameId}/scores`);
      // const { rounds } = response.data;
      // set({ rounds });
      // get().calculateTotals();

      // Mock implementation
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
});

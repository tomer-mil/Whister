/**
 * Zustand Store Selectors
 * Memoized selectors for efficient state access and subscriptions
 */

import { useStore } from '../index';
import type { Store } from '@/types/store';

// ============================================================
// Auth Selectors
// ============================================================

export const selectUser = (state: Store) => state.user;
export const selectIsAuthenticated = (state: Store) => state.isAuthenticated;
export const selectAuthLoading = (state: Store) => state.isLoading;
export const selectAccessToken = (state: Store) => state.accessToken;

export const useUser = () => useStore(selectUser);
export const useIsAuthenticated = () => useStore(selectIsAuthenticated);
export const useAuthLoading = () => useStore(selectAuthLoading);
export const useAccessToken = () => useStore(selectAccessToken);

// ============================================================
// Room Selectors
// ============================================================

export const selectRoomCode = (state: Store) => state.roomCode;
export const selectRoomId = (state: Store) => state.roomId;
export const selectPlayers = (state: Store) => state.players;
export const selectIsAdmin = (state: Store) => state.isAdmin;
export const selectMaxPlayers = (state: Store) => state.maxPlayers;
export const selectRoomLoading = (state: Store) =>
  state.isJoining || state.isCreating;

export const selectPlayerCount = (state: Store) => state.players.length;
export const selectPlayerById = (playerId: string) => (state: Store) =>
  state.players.find((p) => p.userId === playerId);

export const useRoomCode = () => useStore(selectRoomCode);
export const useRoomId = () => useStore(selectRoomId);
export const usePlayers = () => useStore(selectPlayers);
export const useIsAdmin = () => useStore(selectIsAdmin);
export const useMaxPlayers = () => useStore(selectMaxPlayers);
export const useRoomLoading = () => useStore(selectRoomLoading);
export const usePlayerCount = () => useStore(selectPlayerCount);

// ============================================================
// Game Selectors
// ============================================================

export const selectGameId = (state: Store) => state.gameId;
export const selectGameStatus = (state: Store) => state.status;
export const selectCurrentRound = (state: Store) => state.currentRound;
export const selectTotalRounds = (state: Store) => state.totalRounds;
export const selectGamePlayers = (state: Store) => state.gamePlayers;
export const selectMyPlayerId = (state: Store) => state.myPlayerId;

export const selectRoundProgress = (state: Store) =>
  `${state.currentRound}/${state.totalRounds}`;

export const useGameId = () => useStore(selectGameId);
export const useGameStatus = () => useStore(selectGameStatus);
export const useCurrentRound = () => useStore(selectCurrentRound);
export const useTotalRounds = () => useStore(selectTotalRounds);
export const useGamePlayers = () => useStore(selectGamePlayers);
export const useMyPlayerId = () => useStore(selectMyPlayerId);
export const useRoundProgress = () => useStore(selectRoundProgress);

// ============================================================
// Bidding Selectors
// ============================================================

export const selectBiddingPhase = (state: Store) => state.phase;
export const selectTrumpBids = (state: Store) => state.trumpBids;
export const selectContracts = (state: Store) => state.contracts;
export const selectMinimumBid = (state: Store) => state.minimumBid;
export const selectTrumpResult = (state: Store) => state.trumpWinnerId;
export const selectFrischCount = (state: Store) => state.frischCount;
export const selectGameType = (state: Store) => state.gameType;
export const selectCurrentTurn = (state: Store) => state.currentTurnPlayerId;

export const useBiddingPhase = () => useStore(selectBiddingPhase);
export const useTrumpBids = () => useStore(selectTrumpBids);
export const useContracts = () => useStore(selectContracts);
export const useMinimumBid = () => useStore(selectMinimumBid);
export const useTrumpResult = () => useStore(selectTrumpResult);
export const useFrischCount = () => useStore(selectFrischCount);
export const useGameType = () => useStore(selectGameType);
export const useCurrentTurn = () => useStore(selectCurrentTurn);

// ============================================================
// Scores Selectors
// ============================================================

export const selectRounds = (state: Store) => state.rounds;
export const selectPlayerTotals = (state: Store) => state.playerTotals;
export const selectScoresLoading = (state: Store) => state.isLoading;

export const selectLatestRound = (state: Store) => {
  if (state.rounds.length === 0) return undefined;
  return state.rounds[state.rounds.length - 1];
};

export const selectPlayerTotalScore = (playerId: string) => (state: Store) => {
  const total = state.playerTotals.find((t) => t.playerId === playerId);
  return total?.totalScore ?? 0;
};

export const selectLeaderboard = (state: Store) =>
  [...state.playerTotals].sort((a, b) => b.totalScore - a.totalScore);

export const useRounds = () => useStore(selectRounds);
export const usePlayerTotals = () => useStore(selectPlayerTotals);
export const useScoresLoading = () => useStore(selectScoresLoading);
export const useLatestRound = () => useStore(selectLatestRound);
export const useLeaderboard = () => useStore(selectLeaderboard);

// ============================================================
// UI Selectors
// ============================================================

export const selectToasts = (state: Store) => state.toasts;
export const selectActiveModal = (state: Store) => state.activeModal;
export const selectModalProps = (state: Store) => state.modalProps;
export const selectIsLoading = (state: Store) => state.isLoading;
export const selectLoadingMessage = (state: Store) => state.loadingMessage;
export const selectConnectionStatus = (state: Store) => state.connectionStatus;

export const selectToastCount = (state: Store) => state.toasts.length;

export const useToasts = () => useStore(selectToasts);
export const useActiveModal = () => useStore(selectActiveModal);
export const useModalProps = () => useStore(selectModalProps);
export const useIsLoading = () => useStore(selectIsLoading);
export const useLoadingMessage = () => useStore(selectLoadingMessage);
export const useConnectionStatus = () => useStore(selectConnectionStatus);
export const useToastCount = () => useStore(selectToastCount);

// ============================================================
// Action Selectors
// ============================================================

// Auth Actions
export const selectAuthActions = (state: Store) => ({
  login: state.login,
  register: state.register,
  logout: state.logout,
  refreshAuth: state.refreshAuth,
  setUser: state.setUser,
});

// Room Actions
export const selectRoomActions = (state: Store) => ({
  createRoom: state.createRoom,
  joinRoom: state.joinRoom,
  leaveRoom: state.leaveRoom,
  updateSeating: state.updateSeating,
  randomizeSeating: state.randomizeSeating,
  setPlayers: state.setPlayers,
  addPlayer: state.addPlayer,
  removePlayer: state.removePlayer,
  updatePlayerConnection: state.updatePlayerConnection,
});

// Game Actions
export const selectGameActions = (state: Store) => ({
  startGame: state.startGame,
  setGameState: state.setGameState,
  updatePlayer: state.updatePlayer,
  resetGame: state.resetGame,
});

// Bidding Actions
export const selectBiddingActions = (state: Store) => ({
  placeTrumpBid: state.placeTrumpBid,
  passTrumpBid: state.passTrumpBid,
  placeContractBid: state.placeContractBid,
  setPhase: state.setPhase,
  setTrumpBids: state.setTrumpBids,
  addTrumpBid: state.addTrumpBid,
  setTrumpResult: state.setTrumpResult,
  setFrisch: state.setFrisch,
  setContracts: state.setContracts,
  addContract: state.addContract,
  setContractsComplete: state.setContractsComplete,
  setCurrentTurn: state.setCurrentTurn,
  resetBidding: state.resetBidding,
});

// Scores Actions
export const selectScoresActions = (state: Store) => ({
  addRoundScore: state.addRoundScore,
  setRounds: state.setRounds,
  updateRound: state.updateRound,
  calculateTotals: state.calculateTotals,
  fetchScores: state.fetchScores,
});

// UI Actions
export const selectUIActions = (state: Store) => ({
  showToast: state.showToast,
  dismissToast: state.dismissToast,
  openModal: state.openModal,
  closeModal: state.closeModal,
  setLoading: state.setLoading,
  setConnectionStatus: state.setConnectionStatus,
});

export const useAuthActions = () => useStore(selectAuthActions);
export const useRoomActions = () => useStore(selectRoomActions);
export const useGameActions = () => useStore(selectGameActions);
export const useBiddingActions = () => useStore(selectBiddingActions);
export const useScoresActions = () => useStore(selectScoresActions);
export const useUIActions = () => useStore(selectUIActions);

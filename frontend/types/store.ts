/**
 * Zustand Store Type Definitions
 * Complete type definitions for all store slices
 */

import type { TrumpSuit, GameStatus, GameType, RoundPhase } from './game';
import type { ConnectionState } from '@/stores/slices/connection-slice';

// ============================================================
// Auth Slice Types
// ============================================================

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, username: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

// ============================================================
// Room Slice Types
// ============================================================

export interface RoomPlayer {
  userId: string;
  displayName: string;
  seatPosition: number | null;
  isConnected: boolean;
  isAdmin: boolean;
}

export interface RoomState {
  roomCode: string | null;
  roomId: string | null;
  players: RoomPlayer[];
  isAdmin: boolean;
  maxPlayers: number;
  isJoining: boolean;
  isCreating: boolean;
}

export interface RoomActions {
  createRoom: () => Promise<string>;
  joinRoom: (roomCode: string) => Promise<void>;
  leaveRoom: () => void;
  setRoomData: (data: { roomCode: string; roomId?: string; isAdmin: boolean; players: RoomPlayer[] }) => void;
  updateSeating: (playerId: string, position: number) => void;
  randomizeSeating: () => void;
  setPlayers: (players: RoomPlayer[]) => void;
  addPlayer: (player: RoomPlayer) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerConnection: (playerId: string, isConnected: boolean) => void;
}

// ============================================================
// Game Slice Types
// ============================================================

export interface GamePlayer {
  userId: string;
  displayName: string;
  seatPosition: number;
  contractBid: number | null;
  tricksWon: number;
  score: number | null;
  isConnected: boolean;
}

export interface PlayerRoundResult {
  player_id: string;
  player_name: string;
  seat_position: number;
  contract: number;
  tricks_won: number;
  round_score: number;
  made_contract: boolean;
}

export interface GameState {
  gameId: string | null;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  gamePlayers: GamePlayer[];
  myPlayerId: string | null;
  // Playing phase state
  totalTricksPlayed: number;
  playerTricks: Record<string, number>;
  roundResults: PlayerRoundResult[] | null;
}

export interface GameActions {
  startGame: () => Promise<void>;
  setGameState: (state: Partial<GameState>) => void;
  updatePlayer: (playerId: string, data: Partial<GamePlayer>) => void;
  resetGame: () => void;
  // Playing phase actions
  updatePlayerTricks: (playerId: string, tricksWon: number) => void;
  incrementTotalTricks: () => void;
  setRoundResults: (results: PlayerRoundResult[]) => void;
}

// ============================================================
// Bidding Slice Types
// ============================================================

export interface TrumpBid {
  playerId: string;
  playerName: string;
  amount: number;
  suit: TrumpSuit | null;
  isPass: boolean;
  timestamp: string;
}

export interface ContractBid {
  playerId: string;
  playerName: string;
  seatPosition: number;
  amount: number;
  timestamp: string;
}

export interface BiddingState {
  phase: RoundPhase;
  currentTurnPlayerId: string | null;

  // Trump bidding
  trumpBids: TrumpBid[]; // Chronological history of ALL bids and passes
  highestTrumpBid: TrumpBid | null; // Current winning bid
  passedPlayers: Set<string>; // Set of player IDs who have passed
  minimumBid: number;
  consecutivePasses: number; // Deprecated, kept for compatibility
  frischCount: number;

  // Contract bidding
  contracts: ContractBid[];
  contractSum: number;
  trumpWinnerId: string | null;
  trumpWinnerName: string | null;
  trumpWinningBid: number | null;
  trumpSuit: TrumpSuit | null;
  gameType: GameType | null;

  // UI state
  isMyTurn: boolean;
  isLastBidder: boolean;
  isSubmitting: boolean;
}

export interface BiddingActions {
  placeTrumpBid: (amount: number, suit: TrumpSuit) => Promise<void>;
  passTrumpBid: () => Promise<void>;
  placeContractBid: (amount: number) => Promise<void>;

  setPhase: (phase: RoundPhase) => void;
  setTrumpBids: (bids: TrumpBid[]) => void;
  addTrumpBid: (bid: TrumpBid) => void;
  addPass: (playerId: string, playerName: string) => void;
  setTrumpResult: (winnerId: string, winnerName: string, bid: number, suit: TrumpSuit) => void;
  setFrisch: (frischCount: number, minimumBid: number) => void;
  setContracts: (contracts: ContractBid[]) => void;
  addContract: (contract: ContractBid) => void;
  setContractSum: (sum: number) => void;
  setContractsComplete: (gameType: GameType) => void;
  setCurrentTurn: (playerId: string, isLastBidder?: boolean) => void;
  resetBidding: () => void;
}

// ============================================================
// Scores Slice Types
// ============================================================

export interface RoundScore {
  roundNumber: number;
  trumpSuit: TrumpSuit;
  gameType: GameType;
  trumpWinnerId: string;
  playerScores: {
    playerId: string;
    displayName: string;
    seatPosition: number;
    contractBid: number;
    tricksWon: number;
    score: number;
    madeContract: boolean;
    cumulativeScore: number;
  }[];
  commentary: string[];
}

export interface PlayerTotal {
  playerId: string;
  displayName: string;
  totalScore: number;
  rank: number;
  roundsWon: number;
  perfectRounds: number;
}

export interface ScoresState {
  rounds: RoundScore[];
  playerTotals: PlayerTotal[];
  isLoading: boolean;
}

export interface ScoresActions {
  addRoundScore: (round: RoundScore) => void;
  setRounds: (rounds: RoundScore[]) => void;
  updateRound: (roundNumber: number, data: Partial<RoundScore>) => void;
  calculateTotals: () => void;
  fetchScores: (gameId: string) => Promise<void>;
}

// ============================================================
// UI Slice Types
// ============================================================

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

export interface UIState {
  toasts: Toast[];
  activeModal: string | null;
  modalProps: Record<string, unknown>;
  isLoading: boolean;
  loadingMessage: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
}

export interface UIActions {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  openModal: (modalId: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  setLoading: (isLoading: boolean, message?: string) => void;
  setConnectionStatus: (status: UIState['connectionStatus']) => void;
}

// ============================================================
// Combined Store Type
// ============================================================

export type StoreState =
  & AuthState
  & RoomState
  & GameState
  & BiddingState
  & ScoresState
  & UIState
  & ConnectionState;

export type StoreActions =
  & AuthActions
  & RoomActions
  & GameActions
  & BiddingActions
  & ScoresActions
  & UIActions;

export type Store = StoreState & StoreActions;

/**
 * Zustand Store Type Definitions
 * Complete type definitions for all store slices
 */

import type { TrumpSuit, GameStatus, GameType, RoundPhase } from './game';

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

export interface GameState {
  gameId: string | null;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  gamePlayers: GamePlayer[];
  myPlayerId: string | null;
}

export interface GameActions {
  startGame: () => Promise<void>;
  setGameState: (state: Partial<GameState>) => void;
  updatePlayer: (playerId: string, data: Partial<GamePlayer>) => void;
  resetGame: () => void;
}

// ============================================================
// Bidding Slice Types
// ============================================================

export interface TrumpBid {
  playerId: string;
  playerName: string;
  amount: number;
  suit: TrumpSuit;
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
  trumpBids: TrumpBid[];
  highestTrumpBid: TrumpBid | null;
  minimumBid: number;
  consecutivePasses: number;
  frischCount: number;

  // Contract bidding
  contracts: ContractBid[];
  contractSum: number;
  trumpWinnerId: string | null;
  trumpWinningBid: number | null;
  trumpSuit: TrumpSuit | null;
  gameType: GameType | null;

  // UI state
  isMyTurn: boolean;
  isSubmitting: boolean;
}

export interface BiddingActions {
  placeTrumpBid: (amount: number, suit: TrumpSuit) => Promise<void>;
  passTrumpBid: () => Promise<void>;
  placeContractBid: (amount: number) => Promise<void>;

  setPhase: (phase: RoundPhase) => void;
  setTrumpBids: (bids: TrumpBid[]) => void;
  addTrumpBid: (bid: TrumpBid) => void;
  setTrumpResult: (winnerId: string, bid: number, suit: TrumpSuit) => void;
  setFrisch: (frischCount: number, minimumBid: number) => void;
  setContracts: (contracts: ContractBid[]) => void;
  addContract: (contract: ContractBid) => void;
  setContractsComplete: (gameType: GameType) => void;
  setCurrentTurn: (playerId: string) => void;
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
  & UIState;

export type StoreActions =
  & AuthActions
  & RoomActions
  & GameActions
  & BiddingActions
  & ScoresActions
  & UIActions;

export type Store = StoreState & StoreActions;

/**
 * Game Domain Types
 * Core types used throughout the application
 */

// ============================================================
// Enums
// ============================================================

export type TrumpSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no_trump';

export type GameStatus =
  | 'waiting'
  | 'bidding_trump'
  | 'frisch'
  | 'bidding_contract'
  | 'playing'
  | 'round_complete'
  | 'finished';

export type RoundPhase =
  | 'trump_bidding'
  | 'frisch'
  | 'contract_bidding'
  | 'playing'
  | 'complete';

export type GameType = 'over' | 'under';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

// ============================================================
// Domain Models
// ============================================================

export interface Player {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  isConnected: boolean;
}

export interface Room {
  roomId: string;
  roomCode: string;
  createdBy: string;
  players: Player[];
  maxPlayers: number;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  gameId: string;
  roomId: string;
  currentRound: number;
  totalRounds: number;
  status: GameStatus;
  players: Player[];
  startedAt: string;
  updatedAt: string;
}

export interface Round {
  roundNumber: number;
  trumpSuit: TrumpSuit;
  gameType: GameType;
  trumpWinnerId: string;
  playerScores: RoundPlayerScore[];
  startedAt: string;
  completedAt?: string;
}

export interface RoundPlayerScore {
  playerId: string;
  displayName: string;
  seatPosition: number;
  contractBid: number;
  tricksWon: number;
  score: number;
  madeContract: boolean;
  cumulativeScore: number;
}

// ============================================================
// Game State Types
// ============================================================

export interface Bid {
  playerId: string;
  playerName: string;
  amount: number;
  timestamp: string;
}

export interface TrumpBidInfo extends Bid {
  suit: TrumpSuit;
}

export interface ContractBidInfo extends Bid {
  seatPosition: number;
}

export interface GameConfig {
  minPlayers: number;
  maxPlayers: number;
  totalTricks: number;
  minTrumpBid: number;
  maxTrumpBid: number;
  minContractBid: number;
  maxContractBid: number;
  targetContractSum: number;
  minContractSum: number;
  maxContractSum: number;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================
// WebSocket Event Types
// ============================================================

export interface SocketEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: string;
}

export interface RoomEvent extends SocketEvent {
  roomId: string;
}

export interface GameEvent extends SocketEvent {
  gameId: string;
  roundNumber: number;
}

// ============================================================
// UI State Types
// ============================================================

export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

export interface ErrorState {
  hasError: boolean;
  message?: string;
  code?: string;
  recoverable?: boolean;
}

export interface ModalState {
  isOpen: boolean;
  title?: string;
  content?: unknown;
  actions?: ModalAction[];
}

export interface ModalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
}

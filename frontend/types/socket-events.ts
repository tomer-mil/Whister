/**
 * Socket.IO Event Type Definitions
 * Strongly-typed client and server events
 *
 * These types must match the backend schemas in:
 * backend/app/websocket/schemas.py
 */

import type { Socket } from 'socket.io-client';
import type { TrumpSuit, GameType, RoundPhase } from './game';

// ============================================================
// Response Types
// ============================================================

export interface SocketResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
}

// ============================================================
// Shared Types (matching backend models)
// ============================================================

/** Player information in a room - matches backend PlayerInfo */
export interface PlayerInfo {
  user_id: string;
  display_name: string;
  seat_position: number;
  is_admin: boolean;
  is_connected: boolean;
  avatar_url?: string | null;
  timestamp?: string;
}

/** Bid information for display - matches backend BidInfo */
export interface BidInfo {
  player_id: string;
  player_name: string;
  amount: number;
  suit?: TrumpSuit | null;
  is_pass: boolean;
  timestamp?: string | null;
}

/** Contract bid information - matches backend ContractInfo */
export interface ContractInfo {
  player_id: string;
  player_name: string;
  seat_position: number;
  amount: number;
}

/** Cumulative score for a player - matches backend CumulativeScoreInfo */
export interface CumulativeScoreInfo {
  player_id: string;
  player_name: string;
  round_score: number;
  total_score: number;
  position: number;
}

// ============================================================
// Payload Types - Room Events
// ============================================================

/** Payload for room:joined event - matches backend RoomJoinedPayload */
export interface RoomJoinedPayload {
  room_code: string;
  game_id: string;
  your_seat: number;
  is_admin: boolean;
  players: PlayerInfo[];
  phase: string;
  current_round: number | null;
  timestamp?: string;
}

/** Payload for room:player_joined event - matches backend RoomPlayerJoinedPayload */
export interface PlayerJoinedPayload {
  player: PlayerInfo;
  player_count: number;
  timestamp?: string;
}

/** Payload for room:player_left event - matches backend RoomPlayerLeftPayload */
export interface PlayerLeftPayload {
  player_id: string;
  player_name: string;
  reason: 'voluntary' | 'kicked' | 'disconnected';
  player_count: number;
  timestamp?: string;
}

/** Payload for room:player_disconnected event - matches backend RoomPlayerDisconnectedPayload */
export interface PlayerDisconnectedPayload {
  player_id: string;
  player_name: string;
  grace_period_seconds: number;
  timestamp?: string;
}

/** Payload for room:player_reconnected event - matches backend RoomPlayerReconnectedPayload */
export interface PlayerReconnectedPayload {
  player_id: string;
  player_name: string;
  timestamp?: string;
}

/** Payload for room:game_starting event - matches backend RoomGameStartingPayload */
export interface GameStartingPayload {
  game_id: string;
  players: Array<{
    user_id: string;
    seat_position: number;
  }>;
  timestamp?: string;
}

// ============================================================
// Payload Types - Bidding Events
// ============================================================

/** Payload for bid:placed event - matches backend BidPlacedPayload */
export interface BidPlacedPayload {
  bid: BidInfo;
  is_highest: boolean;
  next_bidder_id: string | null;
  next_bidder_name: string | null;
  next_bidder_seat: number | null;
  consecutive_passes: number;
  timestamp?: string;
}

/** Payload for bid:passed event - matches backend BidPassedPayload */
export interface BidPassedPayload {
  player_id: string;
  player_name: string;
  consecutive_passes: number;
  next_bidder_id: string | null;
  next_bidder_name: string | null;
  next_bidder_seat: number | null;
  timestamp?: string;
}

/** Payload for bid:frisch_started event - matches backend BidFrischStartedPayload */
export interface BidFrischStartedPayload {
  frisch_number: number;
  new_minimum_bid: number;
  message: string;
  timestamp?: string;
}

/** Payload for bid:trump_set event - matches backend BidTrumpSetPayload */
export interface BidTrumpSetPayload {
  trump_suit: TrumpSuit;
  winner_id: string;
  winner_name: string;
  winning_bid: number;
  frisch_count: number;
  timestamp?: string;
}

/** Payload for bid:your_turn event - matches backend BidPhaseYourTurnPayload */
export interface BidYourTurnPayload {
  phase: 'trump_bidding' | 'contract_bidding';
  minimum_bid: number | null;
  current_highest: BidInfo | null;
  forbidden_amount: number | null;
  current_contract_sum: number | null;
  is_last_bidder: boolean;
  is_trump_winner: boolean;
  trump_winning_bid: number | null;
  timestamp?: string;
}

/** Payload for bid:contracts_set event - matches backend BidContractsSetPayload */
export interface BidContractsSetPayload {
  contracts: ContractInfo[];
  total_contracts: number;
  game_type: GameType;
  first_player_id: string;
  first_player_name: string;
  timestamp?: string;
}

// ============================================================
// Payload Types - Round/Trick Events
// ============================================================

/** Payload for round:trick_won event - matches backend RoundTrickWonPayload */
export interface RoundTrickWonPayload {
  player_id: string;
  player_name: string;
  new_trick_count: number;
  contract: number;
  total_tricks_played: number;
  remaining_tricks: number;
  timestamp?: string;
}

/** Payload for round:trick_undone event - matches backend RoundTrickUndonePayload */
export interface RoundTrickUndonePayload {
  player_id: string;
  player_name: string;
  new_trick_count: number;
  total_tricks_played: number;
  undone_by: string;
  timestamp?: string;
}

/** Payload for round:complete event - matches backend RoundCompletePayload */
export interface RoundCompletePayload {
  round_number: number;
  trump_suit: TrumpSuit;
  game_type: GameType;
  players: ContractInfo[];
  cumulative_scores: CumulativeScoreInfo[];
  timestamp?: string;
}

// ============================================================
// Payload Types - State Sync
// ============================================================

/** Payload for sync:state event - matches backend SyncStatePayload */
export interface SyncStatePayload {
  room_code: string;
  game_id: string;
  phase: RoundPhase;
  players: PlayerInfo[];
  current_round: number | null;
  current_bidder: string | null;
  additional_data: Record<string, unknown>;
  timestamp?: string;
}

/** Error payload - matches backend ErrorPayload */
export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, string> | null;
  recoverable: boolean;
  timestamp?: string;
}

// ============================================================
// Client → Server Events
// Matches backend ClientEvents and payload classes
// ============================================================

export interface ClientToServerEvents {
  // Room events
  'room:join': (
    data: { room_code: string; display_name?: string },
    callback?: (response: SocketResponse) => void
  ) => void;
  'room:leave': (
    data: { room_code: string },
    callback?: (response: SocketResponse) => void
  ) => void;

  // Bidding events - all require room_code per backend schemas
  'bid:trump': (
    data: { room_code: string; amount: number; suit: TrumpSuit },
    callback?: (response: SocketResponse<BidPlacedPayload>) => void
  ) => void;
  'bid:pass': (
    data: { room_code: string },
    callback?: (response: SocketResponse<BidPassedPayload>) => void
  ) => void;
  'bid:contract': (
    data: { room_code: string; amount: number },
    callback?: (response: SocketResponse) => void
  ) => void;

  // Round/trick events - using backend event names
  'round:claim_trick': (
    data: { room_code: string },
    callback?: (response: SocketResponse<RoundTrickWonPayload>) => void
  ) => void;
  'round:undo_trick': (
    data: { room_code: string; player_id: string },
    callback?: (response: SocketResponse<RoundTrickUndonePayload>) => void
  ) => void;

  // State sync
  'sync:request': (
    data: { room_code: string },
    callback?: (response: SocketResponse<SyncStatePayload>) => void
  ) => void;
}

// ============================================================
// Server → Client Events
// Matches backend ServerEvents class
// ============================================================

export interface ServerToClientEvents {
  // Room events
  'room:joined': (payload: RoomJoinedPayload) => void;
  'room:left': (payload: { room_code: string; reason: string; timestamp?: string }) => void;
  'room:player_joined': (payload: PlayerJoinedPayload) => void;
  'room:player_left': (payload: PlayerLeftPayload) => void;
  'room:player_disconnected': (payload: PlayerDisconnectedPayload) => void;
  'room:player_reconnected': (payload: PlayerReconnectedPayload) => void;
  'room:game_starting': (payload: GameStartingPayload) => void;

  // Bidding events - using backend event names
  'bid:your_turn': (payload: BidYourTurnPayload) => void;
  'bid:placed': (payload: BidPlacedPayload) => void;
  'bid:passed': (payload: BidPassedPayload) => void;
  'bid:trump_set': (payload: BidTrumpSetPayload) => void;
  'bid:frisch_started': (payload: BidFrischStartedPayload) => void;
  'bid:contracts_set': (payload: BidContractsSetPayload) => void;

  // Round/trick events - using backend event names
  'round:trick_won': (payload: RoundTrickWonPayload) => void;
  'round:trick_undone': (payload: RoundTrickUndonePayload) => void;
  'round:complete': (payload: RoundCompletePayload) => void;

  // State sync
  'sync:state': (payload: SyncStatePayload) => void;

  // Errors
  error: (payload: ErrorPayload) => void;
}

// ============================================================
// Typed Socket Interface
// ============================================================

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

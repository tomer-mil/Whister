/**
 * Socket.IO Event Type Definitions
 * Strongly-typed client and server events
 */

import type { Socket } from 'socket.io-client';
import type { TrumpSuit, GameType, RoundPhase } from './game';

// ============================================================
// Response Types
// ============================================================

export interface SocketResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
}

// ============================================================
// Payload Types - Room Events
// ============================================================

export interface PlayerJoinedPayload {
  user_id: string;
  display_name: string;
  is_connected: boolean;
  seat_position?: number | null;
}

export interface PlayerLeftPayload {
  user_id: string;
}

export interface PlayerConnectionPayload {
  user_id: string;
  is_connected: boolean;
}

export interface SeatingUpdatedPayload {
  positions: Record<string, number>;
}

export interface GameStartingPayload {
  game_id: string;
  players: Array<{
    user_id: string;
    seat_position: number;
  }>;
}

// ============================================================
// Payload Types - Bidding Events
// ============================================================

export interface TrumpBidPlacedPayload {
  player_id: string;
  player_name: string;
  amount: number;
  suit: TrumpSuit;
  timestamp: string;
}

export interface PlayerPassedPayload {
  player_id: string;
  player_name: string;
  passes_count: number;
  timestamp: string;
}

export interface FrischStartedPayload {
  frisch_count: number;
  minimum_bid: number;
  current_turn_player_id: string;
}

export interface TrumpSetPayload {
  trump_suit: TrumpSuit;
  winner_id: string;
  winner_name: string;
  winning_bid: number;
}

export interface TurnChangedPayload {
  current_turn_player_id: string;
  current_turn_player_name: string;
  phase: RoundPhase;
}

export interface ContractPlacedPayload {
  player_id: string;
  player_name: string;
  seat_position: number;
  amount: number;
  timestamp: string;
}

export interface ContractsCompletePayload {
  game_type: GameType;
  minimum_bid: number;
}

// ============================================================
// Payload Types - Game Events
// ============================================================

export interface TrickClaimedPayload {
  player_id: string;
  player_name: string;
  new_trick_count: number;
  total_tricks_played: number;
}

export interface TrickUndonePayload {
  trick_id: string;
  tricks_played: number;
}

export interface RoundCompletePayload {
  round_number: number;
  trump_suit: TrumpSuit;
  game_type: GameType;
  players: Array<{
    player_id: string;
    display_name: string;
    seat_position: number;
    contract_bid: number;
    tricks_won: number;
    score: number;
    made_contract: boolean;
    cumulative_score: number;
  }>;
  commentary: string[];
}

export interface GameEndedPayload {
  game_id: string;
  final_scores: Array<{
    player_id: string;
    display_name: string;
    total_score: number;
    rank: number;
  }>;
  total_rounds: number;
}

// ============================================================
// Payload Types - State Sync
// ============================================================

export interface FullStatePayload {
  room_id: string;
  room_code: string;
  game_id: string;
  status: string;
  current_round: number;
  total_rounds: number;
  players: any[];
  phase: RoundPhase;
}

export interface ErrorPayload {
  error: string;
  error_code: string;
  details?: Record<string, any>;
}

// ============================================================
// Client → Server Events
// ============================================================

export interface ClientToServerEvents {
  // Room events
  'room:join': (
    data: { room_code: string },
    callback?: (response: SocketResponse) => void
  ) => void;
  'room:leave': (
    data: { room_code: string },
    callback?: (response: SocketResponse) => void
  ) => void;
  'room:update_seating': (
    data: { player_id: string; seat_position: number },
    callback?: (response: SocketResponse) => void
  ) => void;
  'room:start_game': (
    data: Record<string, never>,
    callback?: (response: SocketResponse<GameStartingPayload>) => void
  ) => void;

  // Bidding events
  'bid:trump': (
    data: { amount: number; suit: TrumpSuit },
    callback?: (response: SocketResponse<TrumpBidPlacedPayload>) => void
  ) => void;
  'bid:pass': (
    data: Record<string, never>,
    callback?: (response: SocketResponse<PlayerPassedPayload>) => void
  ) => void;
  'bid:contract': (
    data: { amount: number },
    callback?: (response: SocketResponse<ContractPlacedPayload>) => void
  ) => void;

  // Game events
  'game:claim_trick': (
    data: Record<string, never>,
    callback?: (response: SocketResponse<TrickClaimedPayload>) => void
  ) => void;
  'game:undo_trick': (
    data: { player_id: string },
    callback?: (response: SocketResponse<TrickUndonePayload>) => void
  ) => void;
  'game:end_round': (
    data: Record<string, never>,
    callback?: (response: SocketResponse) => void
  ) => void;

  // State sync
  'sync:request': (
    data: Record<string, never>,
    callback?: (response: SocketResponse<FullStatePayload>) => void
  ) => void;
}

// ============================================================
// Server → Client Events
// ============================================================

export interface ServerToClientEvents {
  // Room events
  'room:player_joined': (payload: PlayerJoinedPayload) => void;
  'room:player_left': (payload: PlayerLeftPayload) => void;
  'room:player_connected': (payload: PlayerConnectionPayload) => void;
  'room:player_disconnected': (payload: PlayerConnectionPayload) => void;
  'room:seating_updated': (payload: SeatingUpdatedPayload) => void;
  'room:game_starting': (payload: GameStartingPayload) => void;

  // Bidding events
  'bid:trump_placed': (payload: TrumpBidPlacedPayload) => void;
  'bid:player_passed': (payload: PlayerPassedPayload) => void;
  'bid:frisch_started': (payload: FrischStartedPayload) => void;
  'bid:trump_set': (payload: TrumpSetPayload) => void;
  'bid:turn_changed': (payload: TurnChangedPayload) => void;
  'bid:contract_placed': (payload: ContractPlacedPayload) => void;
  'bid:contracts_complete': (payload: ContractsCompletePayload) => void;

  // Game events
  'game:trick_claimed': (payload: TrickClaimedPayload) => void;
  'game:trick_undone': (payload: TrickUndonePayload) => void;
  'game:round_complete': (payload: RoundCompletePayload) => void;
  'game:ended': (payload: GameEndedPayload) => void;

  // State sync
  'sync:full_state': (payload: FullStatePayload) => void;
  error: (payload: ErrorPayload) => void;
}

// ============================================================
// Typed Socket Interface
// ============================================================

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

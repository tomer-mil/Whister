/**
 * Score table types for displaying game history
 */

export interface PlayerRoundScore {
  user_id: string;
  display_name: string;
  seat_position: number;
  contract_bid: number;
  tricks_won: number;
  score: number;
  made_contract: boolean;
}

export interface RoundScore {
  round_number: number;
  trump_suit: 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no_trump';
  game_type: 'over' | 'under';
  players: PlayerRoundScore[];
}

export interface PlayerInfo {
  user_id: string;
  display_name: string;
  seat_position: number;
}

export interface ScoreTableResponse {
  game_id: string;
  room_code: string;
  current_round: number;
  rounds: RoundScore[];
  cumulative_scores: Record<string, number>;
  players: PlayerInfo[];
}

export interface EndGameResponse {
  game_id: string;
  ended_at: string;
  winner_id: string | null;
  final_scores: Record<string, number>;
}

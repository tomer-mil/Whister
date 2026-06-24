import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL || 'http://localhost:8001/api';
const WS_URL = process.env.WS_URL || 'http://localhost:8001';

export interface ScoreTable {
  rounds: { round: number; suit: string; scores: number[] }[];
  totals: number[];
  winnerSeat: number | null;
}

export class BackendClient {
  async scoreTable(gameId: string, token: string): Promise<ScoreTable> {
    const res = await fetch(`${API_URL}/v1/games/${gameId}/score-table`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`score-table ${res.status}: ${await res.text()}`);
    return this.parse(await res.json());
  }

  /**
   * Map the real payload (RECON-confirmed shape) into ScoreTable.
   * Real shape: { game_id, room_code, rounds: [{ round_number, trump_suit, players: [{user_id, score, ...}] }],
   *               cumulative_scores: { uuid: number }, players: [{ user_id, seat_position }] }
   */
  private parse(raw: any): ScoreTable {
    // Map players to seat-ordered array (0..3)
    const seatCount = raw.players?.length ?? 0;

    return {
      rounds: (raw.rounds ?? []).map((r: any) => {
        const roundScores = new Array(seatCount).fill(0);
        for (const p of (r.players ?? [])) {
          const seat = raw.players.findIndex((gp: any) => gp.user_id === p.user_id);
          if (seat >= 0) roundScores[seat] = p.score ?? 0;
        }
        return { round: r.round_number, suit: r.trump_suit, scores: roundScores };
      }),
      totals: raw.players?.map((p: any) => raw.cumulative_scores?.[p.user_id] ?? 0) ?? [],
      winnerSeat: null, // winner_id is not in score-table; only in POST /end response
    };
  }

  openSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(WS_URL, {
        path: '/ws/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 10_000,
      });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  waitForEvent<T>(socket: Socket, event: string, timeoutMs = 15_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      socket.once(event, (d: T) => {
        clearTimeout(t);
        resolve(d);
      });
    });
  }
}

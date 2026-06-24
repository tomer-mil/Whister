import { players, PlayerConfig } from '../config/players';

const API_URL = process.env.API_URL || 'http://localhost:8000/api';

/** Register a player if they don't already exist. Idempotent. */
export async function seedUser(player: PlayerConfig): Promise<void> {
  const res = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: player.email,
      password: player.password,
      username: `e2e_p${player.index}`,
      display_name: `E2E Player ${player.index + 1}`,
    }),
  });
  // 200/201 = created; 409 = already exists (both fine). Anything else is fatal.
  if (!res.ok && res.status !== 409) {
    throw new Error(`[e2e] seed failed for ${player.email} (${res.status}): ${await res.text()}`);
  }
}

export async function seedAllUsers(): Promise<void> {
  for (const p of players) await seedUser(p);
}

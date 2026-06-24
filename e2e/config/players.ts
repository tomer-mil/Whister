import path from 'path';
import fs from 'fs';

export interface PlayerConfig {
  /** 0-based index */
  index: number;
  email: string;
  password: string;
  /** Playwright storageState file – persists cookies + localStorage from browser login */
  storageStatePath: string;
  /** Plain JSON with { accessToken } – used by Socket.IO helpers */
  tokenPath: string;
}

const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

export const players: PlayerConfig[] = [0, 1, 2, 3].map((index) => ({
  index,
  email: `e2e-p${index}@whister.test`,
  password: 'E2eTestPass123',
  storageStatePath: path.resolve(AUTH_DIR, `player${index}-storage.json`),
  tokenPath: path.resolve(AUTH_DIR, `player${index}-token.json`),
}));

/** Read a player's saved access token from disk (written by globalSetup). */
export function loadToken(player: PlayerConfig): string {
  const raw = fs.readFileSync(player.tokenPath, 'utf-8');
  return JSON.parse(raw).accessToken;
}

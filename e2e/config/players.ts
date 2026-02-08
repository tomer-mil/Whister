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

export const players: PlayerConfig[] = [
  {
    index: 0,
    email: 'test@example.com',
    password: 'TestPassword123',
    storageStatePath: path.resolve(AUTH_DIR, 'player0-storage.json'),
    tokenPath: path.resolve(AUTH_DIR, 'player0-token.json'),
  },
  {
    index: 1,
    email: 'tomer.mildworth+2@gmail.com',
    password: 'Tt100396',
    storageStatePath: path.resolve(AUTH_DIR, 'player1-storage.json'),
    tokenPath: path.resolve(AUTH_DIR, 'player1-token.json'),
  },
  {
    index: 2,
    email: 'tomer.mildworth+5@gmail.com',
    password: 'Tt100396',
    storageStatePath: path.resolve(AUTH_DIR, 'player2-storage.json'),
    tokenPath: path.resolve(AUTH_DIR, 'player2-token.json'),
  },
  {
    index: 3,
    email: 'tomer.mildworth+6@gmail.com',
    password: 'Tt100396',
    storageStatePath: path.resolve(AUTH_DIR, 'player3-storage.json'),
    tokenPath: path.resolve(AUTH_DIR, 'player3-token.json'),
  },
];

/** Read a player's saved access token from disk (written by globalSetup). */
export function loadToken(player: PlayerConfig): string {
  const raw = fs.readFileSync(player.tokenPath, 'utf-8');
  return JSON.parse(raw).accessToken;
}

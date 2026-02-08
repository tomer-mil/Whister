import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT_DIR = path.resolve(__dirname, '../..');
const STATE_FILE = path.resolve(__dirname, '..', '.services-state.json');
const API_URL = process.env.API_URL || 'http://localhost:8000';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface ServicesState {
  startedDocker: boolean;
  startedFrontend: boolean;
  frontendPid?: number;
}

/**
 * CI-friendly bootstrap.
 * - Checks backend health (GET /health/ready).  If unhealthy → docker compose up.
 * - Checks frontend reachability.               If unreachable → npx next dev.
 * - Records what was started so globalTeardown can reverse it.
 */
export async function ensureServicesRunning(): Promise<void> {
  const state: ServicesState = { startedDocker: false, startedFrontend: false };

  // ── Backend ─────────────────────────────────────────────────────
  if (!(await isReachable(`${API_URL}/health/ready`))) {
    console.log('[e2e] Backend not healthy – running docker compose up -d ...');
    execSync('docker compose up -d', { cwd: ROOT_DIR, stdio: 'pipe' });
    state.startedDocker = true;
    await waitFor(`${API_URL}/health/ready`, 90_000);
    console.log('[e2e] Backend healthy.');
  }

  // ── Frontend ────────────────────────────────────────────────────
  if (!(await isReachable(BASE_URL))) {
    console.log('[e2e] Frontend not reachable – starting next dev ...');
    const proc = spawn('npx', ['next', 'dev', '--port', '3000'], {
      cwd: path.resolve(ROOT_DIR, 'frontend'),
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    state.startedFrontend = true;
    state.frontendPid = proc.pid;
    await waitFor(BASE_URL, 30_000);
    console.log('[e2e] Frontend reachable.');
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

/** Read the saved state (used by globalTeardown). */
export function readServicesState(): ServicesState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// ── internal ──────────────────────────────────────────────────────────────

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`[e2e] ${url} did not become reachable within ${timeoutMs / 1000}s`);
}

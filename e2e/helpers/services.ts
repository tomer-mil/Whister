import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT_DIR = path.resolve(__dirname, '../..');
const STATE_FILE = path.resolve(__dirname, '..', '.services-state.json');
const API_URL = process.env.API_URL || 'http://localhost:8000';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HEALTH_URL = `${API_URL}/health/ready`;

interface ServicesState {
  startedDocker: boolean;
  startedFrontend: boolean;
  frontendPid?: number;
}

/**
 * CI-friendly bootstrap.
 * - Checks backend health (GET /health/ready).  If unhealthy → docker compose up.
 *   If docker compose fails but backend is already reachable (port conflict), logs a warning.
 * - Checks frontend reachability.  If unreachable → npm run build && npm run start (production).
 * - Records what was started so globalTeardown can reverse it.
 */
export async function ensureServicesRunning(): Promise<void> {
  const state: ServicesState = { startedDocker: false, startedFrontend: false };

  // ── Backend ─────────────────────────────────────────────────────
  if (!(await isReachable(HEALTH_URL))) {
    console.log('[e2e] Backend not healthy – running docker compose up -d ...');
    try {
      execSync('docker compose up -d', { cwd: ROOT_DIR, stdio: 'pipe' });
      state.startedDocker = true;
    } catch (err) {
      // Port conflict - check if backend is already reachable from env
      if (!(await isReachable(HEALTH_URL))) {
        throw new Error(
          '[e2e] Backend not reachable and docker compose failed (port conflict?). ' +
          'Stop conflicting services or set API_URL to a running Whister backend.\n' +
          String(err)
        );
      }
      console.warn('[e2e] docker compose failed but backend is reachable — using existing stack');
    }
    await waitFor(HEALTH_URL, 120_000);
    console.log('[e2e] Backend healthy.');
  }

  // ── Frontend ────────────────────────────────────────────────────
  if (!(await isReachable(BASE_URL))) {
    console.log('[e2e] Frontend not reachable – building & starting (production) ...');
    const frontendDir = path.resolve(ROOT_DIR, 'frontend');
    execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
    const port = process.env.FRONTEND_PORT || '3000';
    const proc = spawn('npm', ['run', 'start', '--', '--port', port], {
      cwd: frontendDir,
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    state.startedFrontend = true;
    state.frontendPid = proc.pid;
    await waitFor(BASE_URL, 60_000);
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

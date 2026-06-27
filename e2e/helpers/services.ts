import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT_DIR = path.resolve(__dirname, '../..');
const STATE_FILE = path.resolve(__dirname, '..', '.services-state.json');
const API_URL = process.env.API_URL || 'http://localhost:8001';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const HEALTH_URL = `${API_URL}/health/ready`;

interface ServicesState {
  startedDocker: boolean;
  startedFrontend: boolean;
  frontendPid?: number;
}

/**
 * CI-friendly bootstrap.
 * - Checks backend health (GET /health/ready) and verifies the service is Whister.
 *   If unhealthy → docker compose up.
 *   If a port is occupied by a non-Whister service, FAIL FAST with port + PID.
 * - Checks frontend reachability.  If unreachable → npm run build && npm run start (production).
 * - Records what was started so globalTeardown can reverse it.
 */
export async function ensureServicesRunning(): Promise<void> {
  const state: ServicesState = { startedDocker: false, startedFrontend: false };

  // ── Backend ─────────────────────────────────────────────────────
  const backendPort = extractPort(API_URL);
  const backendHealthy = await isWhisterHealthy(HEALTH_URL);

  if (!backendHealthy) {
    // Port may be occupied by a non-Whister service — check before starting Docker
    if (await isReachable(HEALTH_URL)) {
      const pid = getPidForPort(backendPort);
      throw new Error(
        `[e2e] ABORT: Port ${backendPort} is reachable but the service is NOT Whister ` +
        `(no "service":"whister" in /health/ready response). ` +
        (pid ? `Occupied by PID ${pid}. ` : '') +
        'Stop the conflicting process before running Whister e2e tests.'
      );
    }

    console.log('[e2e] Backend not healthy – running docker compose up -d ...');
    try {
      execSync('docker compose up -d', { cwd: ROOT_DIR, stdio: 'pipe' });
      state.startedDocker = true;
    } catch (err) {
      // Docker failed — check if Whister is already reachable (race: started between checks)
      if (!(await isWhisterHealthy(HEALTH_URL))) {
        const pid = getPidForPort(backendPort);
        throw new Error(
          `[e2e] Backend not reachable and docker compose failed. ` +
          (pid
            ? `Port ${backendPort} is occupied by PID ${pid} (not Whister). Stop it first.`
            : `Port ${backendPort} is not occupied — check Docker logs.`) +
          '\n' + String(err)
        );
      }
      console.warn('[e2e] docker compose failed but Whister backend is reachable — using existing stack');
    }
    await waitFor(HEALTH_URL, 120_000);
    console.log('[e2e] Backend healthy.');
  } else {
    console.log('[e2e] Backend already healthy (Whister confirmed on port ' + backendPort + ').');
  }

  // ── Frontend ────────────────────────────────────────────────────
  if (!(await isReachable(BASE_URL))) {
    console.log('[e2e] Frontend not reachable – building & starting (production) ...');
    const frontendDir = path.resolve(ROOT_DIR, 'frontend');
    execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
    const port = process.env.FRONTEND_PORT || '3001';
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
  } else {
    const frontendPort = extractPort(BASE_URL);
    console.log('[e2e] Frontend already reachable on port ' + frontendPort + '.');
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

/**
 * Check that the URL is reachable AND responds with "service":"whister".
 * This ensures we never silently test against cookoo or another service on the same port.
 */
async function isWhisterHealthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.service === 'whister';
  } catch {
    return false;
  }
}

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
    if (await isWhisterHealthy(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`[e2e] ${url} did not become Whister-healthy within ${timeoutMs / 1000}s`);
}

/** Extract the numeric port from a URL string, defaulting to 80/443. */
function extractPort(url: string): number {
  try {
    const u = new URL(url);
    if (u.port) return parseInt(u.port, 10);
    return u.protocol === 'https:' ? 443 : 80;
  } catch {
    return 0;
  }
}

/** Return the PID listening on a given host port, or null if not determinable. */
function getPidForPort(port: number): string | null {
  if (!port) return null;
  try {
    // ss -tlnp output: "LISTEN 0 ... *:8001 ... users:(("uvicorn",pid=1234,fd=...))"
    const out = execSync(`ss -tlnp 2>/dev/null | grep ":${port} "`, { encoding: 'utf-8' });
    const m = out.match(/pid=(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

import { execFileSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT_DIR = path.resolve(__dirname, '../..');
const STATE_FILE = path.resolve(__dirname, '..', '.services-state.json');
const API_URL = process.env.API_URL || 'http://localhost:8001';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const API_ORIGIN = new URL(API_URL).origin;
const BASE_ORIGIN = new URL(BASE_URL).origin;
const HEALTH_URL = `${API_ORIGIN}/health/ready`;
const BACKEND_IDENTITY_URL = `${API_ORIGIN}/api/v1`;
const FRONTEND_IDENTITY_URL = `${BASE_ORIGIN}/manifest.json`;
const COMPOSE_FILE = path.resolve(ROOT_DIR, 'docker-compose.yml');

interface ServicesState {
  startedDocker: boolean;
  startedFrontend: boolean;
  frontendPid?: number;
}

type JsonObject = Record<string, unknown>;

export function assertWhisterServiceUrls(apiUrl: string, baseUrl: string): void {
  const api = new URL(apiUrl);
  const frontend = new URL(baseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1']);

  if (!localHosts.has(api.hostname) || api.port !== '8001') {
    throw new Error('[e2e] API_URL must target Whister on localhost:8001');
  }
  if (!localHosts.has(frontend.hostname) || frontend.port !== '3001') {
    throw new Error('[e2e] BASE_URL must target Whister on localhost:3001');
  }
}

export function isWhisterBackendIdentity(value: unknown): boolean {
  if (!isJsonObject(value)) return false;
  return value.name === 'Whist Score Keeper' && value.status === 'ready';
}

export function isWhisterFrontendIdentity(value: unknown): boolean {
  if (!isJsonObject(value)) return false;
  const names = [value.name, value.short_name]
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.toLowerCase());
  return names.some((name) => name === 'whister' || name === 'whist');
}

/**
 * CI-friendly bootstrap.
 * - Checks backend health (GET /health/ready).  If unhealthy → docker compose up.
 *   If docker compose fails but backend is already reachable (port conflict), logs a warning.
 * - Checks frontend reachability.  If unreachable → npm run build && npm run start (production).
 * - Records what was started so globalTeardown can reverse it.
 */
export async function ensureServicesRunning(): Promise<void> {
  assertWhisterServiceUrls(API_URL, BASE_URL);
  const frontendPort = process.env.FRONTEND_PORT || '3001';
  if (frontendPort !== '3001') {
    throw new Error('[e2e] FRONTEND_PORT must be 3001 for the Whister e2e stack');
  }

  const state: ServicesState = { startedDocker: false, startedFrontend: false };

  // ── Backend ─────────────────────────────────────────────────────
  if (!(await isReachable(HEALTH_URL))) {
    console.log('[e2e] Backend not healthy – running docker compose up -d ...');
    try {
      execFileSync(
        'docker',
        ['compose', '--project-name', 'whister', '--file', COMPOSE_FILE, 'up', '-d'],
        { cwd: ROOT_DIR, stdio: 'pipe' },
      );
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
  await assertServiceIdentity(
    BACKEND_IDENTITY_URL,
    isWhisterBackendIdentity,
    'backend',
  );

  // ── Frontend ────────────────────────────────────────────────────
  if (!(await isReachable(BASE_URL))) {
    console.log('[e2e] Frontend not reachable – building & starting (production) ...');
    const frontendDir = path.resolve(ROOT_DIR, 'frontend');
    execFileSync('npm', ['run', 'build'], { cwd: frontendDir, stdio: 'inherit' });
    const proc = spawn('npm', ['run', 'start', '--', '--port', frontendPort], {
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
  await assertServiceIdentity(
    FRONTEND_IDENTITY_URL,
    isWhisterFrontendIdentity,
    'frontend',
  );

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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function assertServiceIdentity(
  url: string,
  predicate: (value: unknown) => boolean,
  service: 'backend' | 'frontend',
): Promise<void> {
  let body: unknown;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    body = await response.json();
  } catch (error) {
    throw new Error(`[e2e] Unable to verify Whister ${service} identity at ${url}: ${String(error)}`);
  }

  if (!predicate(body)) {
    throw new Error(
      `[e2e] Refusing to run: ${url} is not the Whister ${service}. ` +
      'No foreign service will be reused or modified.',
    );
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

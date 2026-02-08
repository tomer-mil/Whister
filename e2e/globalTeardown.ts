import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { readServicesState } from './helpers/services';

const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Global teardown – runs once after the entire suite.
 * Only stops services that globalSetup actually started.
 */
export default async function globalTeardown() {
  const state = readServicesState();
  if (!state) return;

  if (state.startedFrontend && state.frontendPid) {
    try {
      process.kill(state.frontendPid);
      console.log('[e2e] Stopped frontend dev server.');
    } catch {
      // Process already exited – nothing to do.
    }
  }

  if (state.startedDocker) {
    try {
      execSync('docker compose down', { cwd: ROOT_DIR, stdio: 'pipe' });
      console.log('[e2e] docker compose down.');
    } catch {
      console.warn('[e2e] docker compose down failed or was unnecessary.');
    }
  }

  // Clean up the state marker
  const stateFile = path.resolve(__dirname, '.services-state.json');
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
}

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureServicesRunning } from './helpers/services';
import { players } from './config/players';

const API_URL = process.env.API_URL || 'http://localhost:8000/api';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Global setup – runs once before the entire suite.
 *
 * 1. Ensures backend + frontend are reachable (starts them if not).
 * 2. For each of the 4 test players:
 *    a) Logs in via the UI  → saves Playwright storageState (cookies + localStorage)
 *       so that individual test contexts can skip the login step.
 *    b) Logs in via the API → saves the raw access_token so that Socket.IO
 *       helpers can authenticate without a browser.
 */
export default async function globalSetup() {
  await ensureServicesRunning();

  // Make sure the .auth output directory exists
  const authDir = path.resolve(__dirname, '.auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();

  for (const player of players) {
    console.log(`[e2e] Logging in player ${player.index + 1} (${player.email}) …`);

    // ── Browser login → storageState ──────────────────────────────
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', player.email);
    await page.fill('input[type="password"]', player.password);
    await page.click('button[type="submit"]');

    // login-form.tsx uses router.push('/') on success – Next.js client-side
    // routing with no load event.  On failure it renders a server-error div
    // with class "bg-destructive".  Race the two so we fail fast with the
    // actual error message instead of waiting out the full timeout.
    const result = await Promise.race([
      page
        .waitForFunction(() => window.location.pathname === '/', { timeout: 15_000 })
        .then(() => 'ok' as const),
      page
        .waitForSelector('.bg-destructive', { timeout: 15_000 })
        .then((el) => el!.textContent())
        .then((msg) => ({ error: msg }) as const),
    ]);

    if (typeof result === 'object' && 'error' in result) {
      throw new Error(
        `[e2e] Browser login failed for ${player.email}: ${result.error}`
      );
    }

    await page.waitForLoadState('networkidle');

    await context.storageState({ path: player.storageStatePath });
    await context.close();

    // ── API login → access token (for Socket.IO) ─────────────────
    const loginRes = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: player.email, password: player.password }),
    });

    if (!loginRes.ok) {
      const body = await loginRes.text();
      throw new Error(
        `[e2e] API login failed for ${player.email} – ${loginRes.status}: ${body}`
      );
    }

    const loginData = await loginRes.json();
    fs.writeFileSync(
      player.tokenPath,
      JSON.stringify({ accessToken: loginData.tokens.access_token })
    );
  }

  await browser.close();
  console.log('[e2e] All 4 players authenticated. Auth state saved to e2e/.auth/');
}

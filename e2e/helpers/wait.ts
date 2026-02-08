import { Page } from '@playwright/test';

/**
 * Wait for window.location.pathname to match a pattern, then let
 * any in-flight network requests settle.
 *
 * WHY: Next.js router.push / router.replace changes the URL via the
 * History API — no hard navigation, no 'load' event.  Playwright's
 * page.waitForURL() defaults to waitUntil:'load' and hangs forever
 * on these transitions.  This helper polls the live pathname instead.
 *
 * @param pattern  RegExp source string, e.g. "^/room/[A-Za-z0-9]+$".
 *                 Serialised to the browser and compiled there.
 */
export async function waitForPathname(
  page: Page,
  pattern: string,
  timeout = 15_000
): Promise<void> {
  await page.waitForFunction(
    (pat: string) => new RegExp(pat).test(window.location.pathname),
    pattern,
    { timeout }
  );
  await page.waitForLoadState('networkidle');
}

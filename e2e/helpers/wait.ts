import { Page, expect } from '@playwright/test';

export async function waitForPathname(page: Page, pattern: string, timeoutMs = 15_000) {
  await expect.poll(() => page.url(), { timeout: timeoutMs }).toMatch(new RegExp(pattern));
}

export async function waitForTestId(page: Page, testId: string, timeoutMs = 15_000) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: timeoutMs });
}

export async function waitForText(page: Page, testId: string, expected: string, timeoutMs = 15_000) {
  await expect(page.getByTestId(testId)).toHaveText(expected, { timeout: timeoutMs });
}

/** Resolve to the index of the first page where `testId` is visible. Throws on timeout. */
export async function firstPageWith(pages: Page[], testId: string, timeoutMs = 15_000): Promise<number> {
  let found = -1;
  await expect
    .poll(
      async () => {
        for (let i = 0; i < pages.length; i++) {
          if (await pages[i].getByTestId(testId).isVisible()) { found = i; return true; }
        }
        return false;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
  return found;
}

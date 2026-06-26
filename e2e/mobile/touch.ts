import { Page } from '@playwright/test';

/**
 * Assert every listed testid has a bounding box ≥ minPx × minPx.
 * Throws with a report of all failures (does not stop on first).
 * 44px is the iOS Human Interface Guidelines minimum tap-target size.
 */
export async function assertTouchTargets(
  page: Page,
  testIds: string[],
  minPx = 44,
): Promise<void> {
  const failures: string[] = [];
  for (const id of testIds) {
    const box = await page.getByTestId(id).boundingBox();
    if (!box) {
      failures.push(`${id}: element not found / not visible`);
      continue;
    }
    if (box.width < minPx || box.height < minPx) {
      failures.push(
        `${id}: ${box.width.toFixed(0)}×${box.height.toFixed(0)}px — needs ≥${minPx}×${minPx}px`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Touch target violations (finding F4):\n${failures.join('\n')}`);
  }
}

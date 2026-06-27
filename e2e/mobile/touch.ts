import { Page } from '@playwright/test';

export interface TouchPoint {
  x: number;
  y: number;
}

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

/**
 * Send a real Chromium touch sequence and hold it long enough to exercise
 * long-press handling. The timed interval is the gesture itself; callers still
 * gate application state with observable assertions.
 */
export async function longPress(
  page: Page,
  selector: string,
  durationMs = 600,
): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Cannot long-press missing element: ${selector}`);

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await page.evaluate(
      (milliseconds) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)),
      durationMs,
    );
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

/** Send a touch drag through Chromium so the browser performs native scrolling. */
export async function swipe(
  page: Page,
  start: TouchPoint,
  end: TouchPoint,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start],
    });
    for (let step = 1; step <= 5; step += 1) {
      const progress = step / 5;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        }],
      });
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

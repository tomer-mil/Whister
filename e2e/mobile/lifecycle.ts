import { Page } from '@playwright/test';

export async function background(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide', { bubbles: false }));
    window.dispatchEvent(new Event('blur'));
  });
}

export async function foreground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow', { bubbles: false }));
    window.dispatchEvent(new Event('focus'));
  });
}

export async function rotateLandscape(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp || vp.width >= vp.height) return; // already landscape
  await page.setViewportSize({ width: vp.height, height: vp.width });
}

export async function rotatePortrait(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp || vp.height >= vp.width) return; // already portrait
  await page.setViewportSize({ width: vp.height, height: vp.width });
}

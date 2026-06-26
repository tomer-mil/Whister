import { Page, BrowserContext } from '@playwright/test';

export async function goOffline(ctx: BrowserContext): Promise<void> {
  await ctx.setOffline(true);
}

export async function goOnline(ctx: BrowserContext): Promise<void> {
  await ctx.setOffline(false);
}

/**
 * Abort all requests matching urlPattern. Returns a function that removes the route.
 * Usage: const restore = await blockRoute(page, '**\/score-table**'); ... await restore();
 */
export async function blockRoute(
  page: Page,
  urlPattern: string,
): Promise<() => Promise<void>> {
  await page.route(urlPattern, (route) => route.abort());
  return () => page.unroute(urlPattern);
}

const THREE_G = {
  offline: false,
  downloadThroughput: Math.floor((250 * 1024) / 8), // 250 kbps → bytes/s
  uploadThroughput: Math.floor((50 * 1024) / 8),    // 50 kbps → bytes/s
  latency: 300,                                       // ms RTT
};

/**
 * Apply 3G network throttle via CDP. Returns a function that removes it.
 * Usage: const restore = await throttle3G(page); ... await restore();
 */
export async function throttle3G(page: Page): Promise<() => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', THREE_G);
  return async () => {
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    await session.detach();
  };
}

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Each game round can take a while with 4-player coordination
  timeout: 60 * 1000,
  retries: 0,

  reporter: [['html'], ['list']],

  globalSetup: './globalSetup.ts',
  globalTeardown: './globalTeardown.ts',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    actionTimeout: 15 * 1000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});

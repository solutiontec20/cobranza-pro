import { env } from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const localUrl = 'http://127.0.0.1:4200';
const remoteUrl = env['PLAYWRIGHT_BASE_URL'];
const isCI = !!env['CI'];

export default defineConfig({
  testDir: './e2e',

  fullyParallel: false,

  forbidOnly: isCI,

  failOnFlakyTests: isCI,

  retries: isCI ? 2 : 0,

  workers: isCI ? 1 : undefined,

  reporter: 'html',

  use: {
    baseURL: remoteUrl ?? localUrl,

    trace: 'on-first-retry',

    screenshot: 'only-on-failure',

    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: remoteUrl
    ? undefined
    : {
        command: 'pnpm start',
        url: localUrl,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});

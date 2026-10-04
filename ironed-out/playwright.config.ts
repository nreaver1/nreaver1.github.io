import { defineConfig, devices } from '@playwright/test';
import { E2E_API_CLIENT, E2E_CRON_SECRET } from './tests/e2e/api-fixture';

/** `pnpm test:e2e:prod` (or E2E_PROD=1): run against a production build, e.g. to check the CSP. */
const PROD = !!process.env.E2E_PROD || process.env.npm_lifecycle_event === 'test:e2e:prod';
const PORT = 3100;
const DB_PORT = 5434;

export default defineConfig({
  testDir: './tests/e2e',
  // One throwaway database is shared by every test, so run serially.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // The invite page is opened from a text on a phone: test at the narrowest width we support.
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: [
    {
      command: `pnpm exec tsx scripts/local-db.ts --memory`,
      env: {
        LOCAL_DB_PORT: String(DB_PORT),
        LOCAL_DB_API_CLIENT: `${E2E_API_CLIENT.id}:${E2E_API_CLIENT.secret}`,
      },
      port: DB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: PROD
        ? `pnpm exec next build && pnpm exec next start --port ${PORT}`
        : `pnpm exec next dev --port ${PORT}`,
      env: {
        DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
        DATABASE_POOL_MAX: '1',
        APP_URL: `http://localhost:${PORT}`,
        APP_SECRET: 'e2e-only-app-secret-0123456789abcdef',
        NEXT_DIST_DIR: PROD ? '.next-e2e-prod' : '.next-e2e',
        CRON_SECRET: E2E_CRON_SECRET,
        NOTIFY_COALESCE_SECONDS: '0',
      },
      url: `http://localhost:${PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: PROD ? 400_000 : 120_000,
    },
  ],
});

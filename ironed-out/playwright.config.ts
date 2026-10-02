import { defineConfig, devices } from '@playwright/test';

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
      env: { LOCAL_DB_PORT: String(DB_PORT) },
      port: DB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next dev --port ${PORT}`,
      env: {
        DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
        DATABASE_POOL_MAX: '1',
        APP_URL: `http://localhost:${PORT}`,
        COOKIE_SECRET: 'e2e-only-cookie-secret-0123456789abcdef',
        NEXT_DIST_DIR: '.next-e2e',
      },
      url: `http://localhost:${PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

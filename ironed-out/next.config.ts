import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets Playwright run its own dev server next to `pnpm dev` without sharing a build folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Server action arguments include phone numbers and codes; never print them (CLAUDE.md rule).
  logging: { serverFunctions: false },
};

export default nextConfig;

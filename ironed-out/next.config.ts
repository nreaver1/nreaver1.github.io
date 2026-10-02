import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets Playwright run its own dev server next to `pnpm dev` without sharing a build folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Server action arguments include phone numbers and codes; never print them (CLAUDE.md rule).
  logging: { serverFunctions: false },
  // Baseline security headers. A nonce-based CSP for scripts comes with hardening (M9).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

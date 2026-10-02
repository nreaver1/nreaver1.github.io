// Vercel build: production deploys migrate + seed the database first; previews only build.
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (process.env.VERCEL_ENV === 'production') {
  run('pnpm exec tsx scripts/migrate.ts');
  run('pnpm exec tsx scripts/seed.ts');
}
run('pnpm exec next build');

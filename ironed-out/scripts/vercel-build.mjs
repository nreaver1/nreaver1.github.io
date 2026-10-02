// Vercel build: production deploys migrate + seed the database first; previews only build.
// Calls the local binaries directly so it doesn't depend on which pnpm the build image has.
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (process.env.VERCEL_ENV === 'production') {
  run('node_modules/.bin/tsx scripts/migrate.ts');
  run('node_modules/.bin/tsx scripts/seed.ts');
}
run('node_modules/.bin/next build');

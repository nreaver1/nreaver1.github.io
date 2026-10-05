import { z } from 'zod';

export const DEV_SECRET = 'dev-only-secret-not-for-production-0123456789';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Owner connection (hosting integrations set this). The app itself uses `appDatabaseUrl`. */
    DATABASE_URL: z.url(),
    MIGRATION_DATABASE_URL: z.url().optional(),
    /** App connection as the non-superuser role. If unset, see APP_DB_PASSWORD. */
    APP_DATABASE_URL: z.url().optional(),
    /**
     * Password for the `ironed_app` role. When set (and APP_DATABASE_URL isn't), the app connects
     * with DATABASE_URL's host but as `ironed_app`, so Row-Level Security applies. Migrations
     * create/update the role with this password.
     */
    APP_DB_PASSWORD: z.string().min(24).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    APP_URL: z.url().default('http://localhost:3000'),
    /**
     * Server secret (≥ 32 random chars). Signs device cookies, derives invite-link tokens and keys
     * verification-code hashes. Required in production; rotating it invalidates existing links.
     */
    APP_SECRET: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default('Ironed Out <noreply@example.com>'),
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(),
    /** Secret for scheduled calls to /api/internal/*. */
    CRON_SECRET: z.string().min(16).optional(),
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.APP_SECRET, {
    path: ['APP_SECRET'],
    message: 'required in production',
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Reads and validates env vars once. Throws listing missing keys, never their values. */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export const appSecret = (env: Env) => env.APP_SECRET ?? DEV_SECRET;

export const APP_DB_ROLE = 'ironed_app';

/** The connection string the app uses (never the owner when a role password is configured). */
export function appDatabaseUrl(env: Env): string {
  if (env.APP_DATABASE_URL) return env.APP_DATABASE_URL;
  if (env.APP_DB_PASSWORD) {
    const url = new URL(env.DATABASE_URL);
    url.username = APP_DB_ROLE;
    url.password = env.APP_DB_PASSWORD;
    return url.toString();
  }
  return env.DATABASE_URL;
}

/** True when real SMS isn't configured: codes are shown on screen, texts go to the outbox. */
export const isSmsDemo = (env: Env) =>
  !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID);

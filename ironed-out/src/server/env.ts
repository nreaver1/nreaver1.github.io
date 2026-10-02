import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    MIGRATION_DATABASE_URL: z.url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    APP_URL: z.url().default('http://localhost:3000'),
    /** Signs device cookies. At least 32 random chars; required in production. */
    COOKIE_SECRET: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default('Ironed Out <noreply@example.com>'),
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().min(1).optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(),
    /** Secret for Vercel Cron calls to /api/internal/*. */
    CRON_SECRET: z.string().min(16).optional(),
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.COOKIE_SECRET, {
    path: ['COOKIE_SECRET'],
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

/** True when real SMS isn't configured: codes are shown on screen, texts go to the outbox. */
export const isSmsDemo = (env: Env) => !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

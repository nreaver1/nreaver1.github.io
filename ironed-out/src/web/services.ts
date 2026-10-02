import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { tenants } from '@/server/db/schema';
import { CONSUMER_TENANT_SLUG } from '@/server/db/seed';
import type { Db } from '@/server/db/types';
import { getEnv } from '@/server/env';
import { OutboxMailer, ResendMailer, type Mailer } from '@/server/notify/email';
import { hibpBreachChecker, type BreachChecker } from '@/server/security/password';

export type Services = {
  db: Db;
  tenantId: string;
  mailer: Mailer;
  isBreached: BreachChecker;
  appUrl: string;
};

// Module-level singletons survive across requests in one server instance.
const globalForServices = globalThis as unknown as { __ioOutbox?: OutboxMailer; __ioTenantId?: string };

export function getOutbox(): OutboxMailer {
  globalForServices.__ioOutbox ??= new OutboxMailer();
  return globalForServices.__ioOutbox;
}

function getMailer(): Mailer {
  const env = getEnv();
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  return getOutbox();
}

async function getConsumerTenantId(db: Db): Promise<string> {
  if (globalForServices.__ioTenantId) return globalForServices.__ioTenantId;
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, CONSUMER_TENANT_SLUG));
  if (!t) throw new Error('Consumer tenant missing. Run `pnpm db:seed`.');
  // Only cache in production: in dev the local database gets reset under a running server.
  if (process.env.NODE_ENV === 'production') globalForServices.__ioTenantId = t.id;
  return t.id;
}

export async function getServices(): Promise<Services> {
  const env = getEnv();
  const db = getDb();
  return {
    db,
    tenantId: await getConsumerTenantId(db),
    mailer: getMailer(),
    isBreached: hibpBreachChecker(),
    appUrl: env.APP_URL.replace(/\/$/, ''),
  };
}

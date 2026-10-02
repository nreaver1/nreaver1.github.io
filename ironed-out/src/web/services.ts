import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { tenants } from '@/server/db/schema';
import { CONSUMER_TENANT_SLUG } from '@/server/db/seed';
import type { Db } from '@/server/db/types';
import { appSecret, getEnv, isSmsDemo } from '@/server/env';
import { OutboxMailer, ResendMailer, type Mailer } from '@/server/notify/email';
import { DemoSms, TwilioSms, type SmsSender } from '@/server/notify/sms';
import { DemoVerifier, TwilioVerifier, type PhoneVerifier } from '@/server/notify/verify';
import { hibpBreachChecker, type BreachChecker } from '@/server/security/password';

export type Services = {
  db: Db;
  tenantId: string;
  mailer: Mailer;
  verifier: PhoneVerifier;
  sms: SmsSender;
  isBreached: BreachChecker;
  appUrl: string;
  secret: string;
  smsDemo: boolean;
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

function getVerifier(db: Db): PhoneVerifier {
  const env = getEnv();
  if (!isSmsDemo(env)) {
    return new TwilioVerifier(
      env.TWILIO_ACCOUNT_SID!,
      env.TWILIO_AUTH_TOKEN!,
      env.TWILIO_VERIFY_SERVICE_SID!,
    );
  }
  return new DemoVerifier(db, appSecret(env));
}

function getSms(): SmsSender {
  const env = getEnv();
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID) {
    return new TwilioSms(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_MESSAGING_SERVICE_SID);
  }
  return new DemoSms();
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
    verifier: getVerifier(db),
    sms: getSms(),
    isBreached: hibpBreachChecker(),
    appUrl: env.APP_URL.replace(/\/$/, ''),
    secret: appSecret(env),
    smsDemo: isSmsDemo(env),
  };
}

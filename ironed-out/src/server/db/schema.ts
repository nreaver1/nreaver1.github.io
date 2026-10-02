import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, id, timestamps } from './columns';

/**
 * Row-Level Security: every tenant-owned table gets this policy. The tenant comes from the
 * transaction-local setting `app.tenant_id` (see `withTenant`). With no setting, no rows match.
 */
const tenantIsolation = (table: string) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: 'permissive',
    for: 'all',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  });

export const tenantStatus = pgEnum('tenant_status', ['active', 'suspended']);

/** Not tenant-scoped itself: the app looks tenants up by slug before a tenant context exists. */
export const tenants = pgTable('tenants', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: tenantStatus('status').notNull().default('active'),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: citext('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    phoneE164: text('phone_e164'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    mfaSecretEnc: text('mfa_secret_enc'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_tenant_email_key').on(t.tenantId, t.email), tenantIsolation('users')],
).enableRLS();

/**
 * Anyone who can occupy a slot. Linked to a user once they have an account; otherwise known by a
 * verified phone.
 */
export const players = pgTable(
  'players',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    phoneE164: text('phone_e164'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('players_tenant_phone_key')
      .on(t.tenantId, t.phoneE164)
      .where(sql`${t.phoneE164} is not null`),
    tenantIsolation('players'),
  ],
).enableRLS();

/** Server-side sessions. Only the SHA-256 of the cookie token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Single-use password reset links (SPEC §3.2): 30-minute expiry, only the hash stored. */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('password_reset_tokens_user_idx').on(t.userId)],
);

/** Fixed-window counters for rate limiting, kept in Postgres so they work on serverless hosts. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    ip: inet('ip'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt), tenantIsolation('audit_log')],
).enableRLS();

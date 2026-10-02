import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, geographyPoint, id, timestamps } from './columns';

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

/**
 * Child tables of an outing don't carry tenant_id; they are visible only when their outing is
 * (the subquery is itself filtered by the outings policy).
 */
const viaOuting = (table: string) =>
  pgPolicy(`${table}_via_outing`, {
    as: 'permissive',
    for: 'all',
    using: sql`outing_id in (select id from outings)`,
    withCheck: sql`outing_id in (select id from outings)`,
  });

export const courseSource = pgEnum('course_source', ['seed', 'provider', 'manual']);

/** Shared catalog (not tenant-owned). */
export const courses = pgTable(
  'courses',
  {
    id: id(),
    name: text('name').notNull(),
    address: text('address'),
    city: text('city').notNull(),
    region: text('region').notNull(),
    country: text('country').notNull().default('US'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    /** IANA zone used to turn the outing's local tee times into instants. */
    timezone: text('timezone').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    source: courseSource('source').notNull().default('seed'),
    externalIds: jsonb('external_ids').$type<Record<string, string>>().notNull().default({}),
    geog: geographyPoint('geog').generatedAlwaysAs(
      sql`(st_setsrid(st_makepoint(lng, lat), 4326))::geography`,
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('courses_name_city_key').on(t.name, t.city, t.region),
    index('courses_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
    index('courses_city_trgm_idx').using('gin', t.city.op('gin_trgm_ops')),
    index('courses_geog_idx').using('gist', t.geog),
  ],
);

export const outings = pgTable(
  'outings',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    organizerPlayerId: uuid('organizer_player_id')
      .notNull()
      .references(() => players.id),
    crewId: uuid('crew_id').references((): AnyPgColumn => crews.id, { onDelete: 'set null' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    playDate: date('play_date').notNull(),
    timezone: text('timezone').notNull(),
    priceCents: integer('price_cents'),
    currency: text('currency').notNull().default('USD'),
    note: text('note').notNull().default(''),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    externalRef: text('external_ref'),
    /** Bumped on every change; used for cache-busting and optimistic checks. */
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('outings_organizer_idx').on(t.organizerPlayerId),
    index('outings_play_date_idx').on(t.tenantId, t.playDate),
    check('outings_price_nonnegative', sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
    tenantIsolation('outings'),
  ],
).enableRLS();

export const teeTimes = pgTable(
  'tee_times',
  {
    id: id(),
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    capacity: smallint('capacity').notNull().default(4),
    sort: smallint('sort').notNull(),
    ...timestamps,
  },
  (t) => [
    index('tee_times_outing_idx').on(t.outingId, t.sort),
    check('tee_times_capacity_range', sql`${t.capacity} between 2 and 5`),
    viaOuting('tee_times'),
  ],
).enableRLS();

export const slots = pgTable(
  'slots',
  {
    id: id(),
    teeTimeId: uuid('tee_time_id')
      .notNull()
      .references(() => teeTimes.id, { onDelete: 'cascade' }),
    /** Denormalized so "one personal slot per player per outing" is a unique index. */
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    playerId: uuid('player_id').references(() => players.id),
    guestOfPlayerId: uuid('guest_of_player_id').references(() => players.id),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('slots_tee_time_position_key').on(t.teeTimeId, t.position),
    uniqueIndex('slots_one_personal_slot_per_outing')
      .on(t.outingId, t.playerId)
      .where(sql`${t.playerId} is not null and ${t.guestOfPlayerId} is null`),
    index('slots_outing_idx').on(t.outingId),
    check('slots_guest_shape', sql`${t.guestOfPlayerId} is null or ${t.playerId} is null`),
    viaOuting('slots'),
  ],
).enableRLS();

export const outingEventType = pgEnum('outing_event_type', [
  'outing_created',
  'slot_claimed',
  'slot_released',
  'player_removed',
  'guest_added',
  'tee_time_added',
  'tee_time_removed',
  'capacity_changed',
  'outing_updated',
  'locked',
  'unlocked',
]);

/** Append-only change log. Drives the "Since you last looked" banner, texts and webhooks. */
export const outingEvents = pgTable(
  'outing_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    type: outingEventType('type').notNull(),
    actorPlayerId: uuid('actor_player_id').references(() => players.id),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outing_events_outing_idx').on(t.outingId, t.id), viaOuting('outing_events')],
).enableRLS();

/** Cursor for the "Since you last looked" banner. */
export const outingViews = pgTable(
  'outing_views',
  {
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    /** player id when known, else a hash of the signed anonymous device id. */
    viewerKey: text('viewer_key').notNull(),
    lastSeenEventId: bigint('last_seen_event_id', { mode: 'number' }).notNull().default(0),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.outingId, t.viewerKey] }), viaOuting('outing_views')],
).enableRLS();

/**
 * Shareable outing links. The token is derived from the row id with the app secret (so the
 * organizer can see it again) and only its SHA-256 is stored. Revoke = new row.
 */
export const inviteLinks = pgTable(
  'invite_links',
  {
    id: id(),
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => players.id),
    ...timestamps,
  },
  (t) => [index('invite_links_outing_idx').on(t.outingId), viaOuting('invite_links')],
).enableRLS();

export const verificationPurpose = pgEnum('verification_purpose', ['claim', 'phone']);

/** Phone codes when we issue them ourselves (SMS demo mode). With Twilio Verify, Twilio keeps them. */
export const verificationCodes = pgTable(
  'verification_codes',
  {
    id: id(),
    phoneE164: text('phone_e164').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: verificationPurpose('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: smallint('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('verification_codes_phone_idx').on(t.phoneE164, t.createdAt)],
);

/** Player-owned rows are visible when the player is (players carry the tenant policy). */
const viaPlayer = (table: string) =>
  pgPolicy(`${table}_via_player`, {
    as: 'permissive',
    for: 'all',
    using: sql`player_id in (select id from players)`,
    withCheck: sql`player_id in (select id from players)`,
  });

/** The alert types a player can switch on/off per channel (SPEC §3.5). */
export const alertType = pgEnum('alert_type', ['join', 'drop', 'change', 'remind_day', 'remind_2h']);

export const notificationPrefs = pgTable(
  'notification_prefs',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    eventType: alertType('event_type').notNull(),
    sms: boolean('sms').notNull(),
    email: boolean('email').notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.playerId, t.eventType] }), viaPlayer('notification_prefs')],
).enableRLS();

export const notificationSettings = pgTable(
  'notification_settings',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Null start/end = quiet hours off. No row = defaults (10 PM to 7 AM). */
    quietStart: time('quiet_start'),
    quietEnd: time('quiet_end'),
    timezone: text('timezone'),
    smsOptedOutAt: timestamp('sms_opted_out_at', { withTimezone: true }),
    ...timestamps,
  },
  () => [viaPlayer('notification_settings')],
).enableRLS();

export const notificationChannel = pgEnum('notification_channel', ['sms', 'email']);
export const notificationKind = pgEnum('notification_kind', [
  'change',
  'removed',
  'remind_day',
  'remind_2h',
  'new_outing',
]);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'skipped', 'failed']);

/**
 * Outbox of texts/emails (replaces pg-boss; see SPEC §5). Rows are written in the same transaction
 * as the outing event and sent by the dispatcher once `send_after` passes. Change alerts for the
 * same player, outing and channel coalesce into one pending row.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    outingId: uuid('outing_id').references(() => outings.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    kind: notificationKind('kind').notNull(),
    /** Merge key for pending change alerts; once-only key for reminders. */
    key: text('key'),
    eventIds: jsonb('event_ids').$type<number[]>().notNull().default([]),
    sendAfter: timestamp('send_after', { withTimezone: true }).notNull(),
    status: notificationStatus('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** What was sent, without the link (kept for the demo history and support). */
    body: text('body'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('notifications_pending_key')
      .on(t.key)
      .where(sql`${t.status} = 'pending' and ${t.key} is not null`),
    uniqueIndex('notifications_reminder_once')
      .on(t.key)
      .where(sql`${t.kind} in ('remind_day', 'remind_2h')`),
    index('notifications_due_idx').on(t.status, t.sendAfter),
    index('notifications_player_idx').on(t.playerId, t.createdAt),
    tenantIsolation('notifications'),
  ],
).enableRLS();

/** Crew child tables are visible when their crew is (crews carry the tenant policy). */
const viaCrew = (table: string) =>
  pgPolicy(`${table}_via_crew`, {
    as: 'permissive',
    for: 'all',
    using: sql`crew_id in (select id from crews)`,
    withCheck: sql`crew_id in (select id from crews)`,
  });

/** A named group of account holders ("Saturday Hackers"). */
export const crews = pgTable(
  'crews',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [index('crews_owner_idx').on(t.ownerUserId), tenantIsolation('crews')],
).enableRLS();

export const crewRole = pgEnum('crew_role', ['owner', 'member']);
export const crewMemberStatus = pgEnum('crew_member_status', ['active', 'pending']);

export const crewMembers = pgTable(
  'crew_members',
  {
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: crewRole('role').notNull().default('member'),
    status: crewMemberStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.crewId, t.userId] }),
    index('crew_members_user_idx').on(t.userId),
    viaCrew('crew_members'),
  ],
).enableRLS();

/** Crew invite links: token derived from the row id with the app secret; only the hash stored. */
export const crewInvites = pgTable(
  'crew_invites',
  {
    id: id(),
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    ...timestamps,
  },
  (t) => [index('crew_invites_crew_idx').on(t.crewId), viaCrew('crew_invites')],
).enableRLS();

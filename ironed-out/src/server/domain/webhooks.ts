import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../audit';
import { outingEvents, outings, slots, tenants, webhookDeliveries, webhookEndpoints } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import { open, seal } from '../security/secretbox';
import { hmac, randomToken, safeEqual } from '../security/tokens';
import { parseInput } from '../validation';

/** Public webhook event types (SPEC §7). They mirror outing_events. */
export const WEBHOOK_EVENTS = [
  'outing.created',
  'outing.updated',
  'outing.locked',
  'outing.unlocked',
  'outing.full',
  'slot.claimed',
  'slot.released',
  'tee_time.added',
  'tee_time.removed',
  'tee_time.capacity_changed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

type OutingEventType = (typeof outingEvents.$inferInsert)['type'];

const WEBHOOK_FOR: Partial<Record<OutingEventType, WebhookEvent>> = {
  outing_created: 'outing.created',
  outing_updated: 'outing.updated',
  locked: 'outing.locked',
  unlocked: 'outing.unlocked',
  slot_claimed: 'slot.claimed',
  slot_released: 'slot.released',
  player_removed: 'slot.released',
  tee_time_added: 'tee_time.added',
  tee_time_removed: 'tee_time.removed',
  capacity_changed: 'tee_time.capacity_changed',
};

/** Deliveries are retried with exponential backoff for a day (SPEC §7). */
export const RETRY_WINDOW_MS = 24 * 3_600_000;
export const MAX_BACKOFF_MS = 60 * 60_000;
export const DELIVERY_TIMEOUT_MS = 5_000;
export const SIGNATURE_HEADER = 'Ironed-Signature';
export const MAX_ENDPOINTS_PER_TENANT = 10;
export const WEBHOOK_API_VERSION = '2026-10-01';
const SECRET_PURPOSE = 'webhook-secret';

// ---------------------------------------------------------------------------------------------
// Endpoints (CRUD for /api/v1/webhooks)
// ---------------------------------------------------------------------------------------------

export type WebhookDeps = {
  db: Db;
  tenantId: string;
  secret: string;
  /** Dev/test only: allow http:// and private hosts. */
  allowInsecureUrls?: boolean;
  now?: () => Date;
};

const EventList = z
  .array(z.enum(WEBHOOK_EVENTS))
  .min(1, 'Subscribe to at least one event.')
  .max(WEBHOOK_EVENTS.length)
  .transform((v) => [...new Set(v)]);

const urlSchema = (allowInsecure: boolean) =>
  z
    .url('Enter a full URL, like https://example.com/hooks/ironed-out.')
    .max(2000)
    .refine((u) => {
      const url = new URL(u);
      if (url.username || url.password) return false;
      if (url.protocol === 'https:') return allowInsecure || !isPrivateHostLiteral(url.hostname);
      return allowInsecure && url.protocol === 'http:';
    }, 'Use a public https:// URL.');

export const CreateWebhookInput = (allowInsecure = false) =>
  z.object({
    url: urlSchema(allowInsecure),
    events: EventList,
    description: z.string().trim().max(200).default(''),
  });

export const UpdateWebhookInput = (allowInsecure = false) =>
  z
    .object({
      url: urlSchema(allowInsecure).optional(),
      events: EventList.optional(),
      description: z.string().trim().max(200).optional(),
      enabled: z.boolean().optional(),
    })
    .strict();

export type WebhookEndpointView = {
  id: string;
  url: string;
  events: WebhookEvent[];
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const viewOf = (e: typeof webhookEndpoints.$inferSelect): WebhookEndpointView => ({
  id: e.id,
  url: e.url,
  events: e.events.filter((x): x is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(x)),
  description: e.description,
  enabled: !e.disabledAt,
  created_at: e.createdAt.toISOString(),
  updated_at: e.updatedAt.toISOString(),
});

async function endpointOf(tx: Tx, id: string) {
  if (!z.uuid().safeParse(id).success) throw new DomainError('not_found', 'No webhook with that id.');
  const [e] = await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  if (!e) throw new DomainError('not_found', 'No webhook with that id.');
  return e;
}

/** Creates an endpoint. The signing secret is returned only here. */
export async function createWebhookEndpoint(deps: WebhookDeps, actor: string, input: unknown) {
  const data = parseInput(CreateWebhookInput(deps.allowInsecureUrls), input);
  const signingSecret = `whsec_${randomToken(32)}`;
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(webhookEndpoints);
    if ((count?.n ?? 0) >= MAX_ENDPOINTS_PER_TENANT) {
      throw new DomainError('conflict', `You can have up to ${MAX_ENDPOINTS_PER_TENANT} webhook endpoints.`);
    }
    const [e] = await tx
      .insert(webhookEndpoints)
      .values({
        tenantId: deps.tenantId,
        url: data.url,
        events: data.events,
        description: data.description,
        secretEnc: seal(deps.secret, SECRET_PURPOSE, signingSecret),
      })
      .returning();
    await audit(tx, {
      tenantId: deps.tenantId,
      actor,
      action: 'webhook.created',
      target: `webhook:${e!.id}`,
    });
    return { ...viewOf(e!), secret: signingSecret };
  });
}

export async function listWebhookEndpoints(deps: WebhookDeps) {
  return withTenant(deps.db, deps.tenantId, async (tx) =>
    (await tx.select().from(webhookEndpoints).orderBy(asc(webhookEndpoints.createdAt))).map(viewOf),
  );
}

export async function getWebhookEndpoint(deps: WebhookDeps, id: string) {
  return withTenant(deps.db, deps.tenantId, async (tx) => viewOf(await endpointOf(tx, id)));
}

export async function updateWebhookEndpoint(deps: WebhookDeps, actor: string, id: string, input: unknown) {
  const data = parseInput(UpdateWebhookInput(deps.allowInsecureUrls), input);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const e = await endpointOf(tx, id);
    const [updated] = await tx
      .update(webhookEndpoints)
      .set({
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.events !== undefined ? { events: data.events } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.enabled !== undefined
          ? { disabledAt: data.enabled ? null : (deps.now?.() ?? new Date()) }
          : {}),
      })
      .where(eq(webhookEndpoints.id, e.id))
      .returning();
    await audit(tx, {
      tenantId: deps.tenantId,
      actor,
      action: 'webhook.updated',
      target: `webhook:${e.id}`,
      meta: { fields: Object.keys(data) },
    });
    return viewOf(updated!);
  });
}

export async function deleteWebhookEndpoint(deps: WebhookDeps, actor: string, id: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const e = await endpointOf(tx, id);
    await tx.delete(webhookEndpoints).where(eq(webhookEndpoints.id, e.id));
    await audit(tx, { tenantId: deps.tenantId, actor, action: 'webhook.deleted', target: `webhook:${e.id}` });
  });
}

/** Recent deliveries for an endpoint (for partners debugging their receiver). */
export async function listDeliveries(deps: WebhookDeps, endpointId: string, limit = 20) {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const e = await endpointOf(tx, endpointId);
    const rows = await tx
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, e.id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
    return rows.map((d) => ({
      id: d.id,
      type: d.eventType,
      status: d.status,
      attempts: d.attempts,
      last_status: d.lastStatus,
      last_error: d.lastError,
      next_attempt_at: d.status === 'pending' ? d.nextAttemptAt.toISOString() : null,
      delivered_at: d.deliveredAt?.toISOString() ?? null,
      created_at: d.createdAt.toISOString(),
    }));
  });
}

// ---------------------------------------------------------------------------------------------
// Fan-out: called by recordEvent inside the event's transaction
// ---------------------------------------------------------------------------------------------

export async function enqueueWebhooks(
  tx: Tx,
  e: { id: number; outingId: string; type: OutingEventType },
  now = new Date(),
) {
  const type = WEBHOOK_FOR[e.type];
  if (!type) return;
  // RLS limits this to the current tenant's endpoints.
  const endpoints = await tx
    .select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
    .from(webhookEndpoints)
    .where(isNull(webhookEndpoints.disabledAt));
  if (!endpoints.length) return;

  let full = false;
  if (e.type === 'slot_claimed' && endpoints.some((x) => x.events.includes('outing.full'))) {
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(slots)
      .where(and(eq(slots.outingId, e.outingId), isNull(slots.playerId), isNull(slots.guestOfPlayerId)));
    full = (open?.n ?? 1) === 0;
  }

  const rows: (typeof webhookDeliveries.$inferInsert)[] = [];
  for (const ep of endpoints) {
    if (ep.events.includes(type)) {
      rows.push({ endpointId: ep.id, eventId: e.id, eventType: type, nextAttemptAt: now });
    }
    if (full && ep.events.includes('outing.full')) {
      rows.push({ endpointId: ep.id, eventId: e.id, eventType: 'outing.full', nextAttemptAt: now });
    }
  }
  if (rows.length) await tx.insert(webhookDeliveries).values(rows).onConflictDoNothing();
}

// ---------------------------------------------------------------------------------------------
// Payloads and signatures
// ---------------------------------------------------------------------------------------------

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The public `data` for one event. Never includes phone numbers or emails. */
export function webhookData(
  type: string,
  event: { type: OutingEventType; actorPlayerId: string | null; payload: Record<string, unknown> },
  outing: { id: string; externalRef: string | null },
): Record<string, unknown> {
  const p = event.payload;
  const base = { outing_id: outing.id, external_ref: outing.externalRef };
  switch (type) {
    case 'outing.created':
      return { ...base, tee_times: num(p.teeTimes), spots: num(p.spots) };
    case 'outing.updated':
      return { ...base, fields: strs(p.fields).map((f) => (f === 'price' ? 'price_cents' : f)) };
    case 'slot.claimed':
      return {
        ...base,
        slot_id: str(p.slotId),
        starts_at: str(p.startsAt),
        player: { id: event.actorPlayerId, name: str(p.playerName) },
        guest_count: num(p.guestCount),
        guest_slot_ids: strs(p.guestSlotIds),
      };
    case 'slot.released': {
      const removed = event.type === 'player_removed';
      return {
        ...base,
        reason: removed ? 'removed' : 'dropped_out',
        starts_at: str(p.startsAt),
        slot_ids: strs(p.slotIds),
        player: p.guest
          ? null
          : { id: removed ? str(p.playerId) : event.actorPlayerId, name: str(p.playerName) },
        guest_count: p.guest ? 1 : num(p.guestCount),
      };
    }
    case 'tee_time.added':
      return { ...base, tee_time_id: str(p.teeTimeId), starts_at: str(p.startsAt), capacity: num(p.spots) };
    case 'tee_time.removed':
      return { ...base, starts_at: str(p.startsAt) };
    case 'tee_time.capacity_changed':
      return {
        ...base,
        tee_time_id: str(p.teeTimeId),
        starts_at: str(p.startsAt),
        from: num(p.from),
        to: num(p.to),
      };
    default:
      return base; // outing.locked, outing.unlocked, outing.full
  }
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>` */
export function signatureHeader(signingSecret: string, body: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${hmac(signingSecret, `${t}.${body}`).toString('hex')}`;
}

/** Reference verifier for receivers (and our tests): checks the HMAC and a 5-minute window. */
export function verifySignature(
  signingSecret: string,
  body: string,
  header: string,
  now = new Date(),
  toleranceSec = 300,
): boolean {
  const parts = new Map(
    header.split(',').map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]),
  );
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1');
  if (!Number.isInteger(t) || !v1) return false;
  if (Math.abs(now.getTime() / 1000 - t) > toleranceSec) return false;
  return safeEqual(v1, hmac(signingSecret, `${t}.${body}`).toString('hex'));
}

// ---------------------------------------------------------------------------------------------
// Delivery (run by the dispatcher)
// ---------------------------------------------------------------------------------------------

export type WebhookRequest = { url: string; headers: Record<string, string>; body: string };
/** Sends one webhook; resolves with the HTTP status. Swappable for tests. */
export type WebhookSender = (req: WebhookRequest) => Promise<number>;

const privateRanges = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  privateRanges.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 127],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  privateRanges.addSubnet(net, bits, 'ipv6');
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (!v) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return privateRanges.check(mapped[1]!, 'ipv4');
  return privateRanges.check(ip, v === 4 ? 'ipv4' : 'ipv6');
}

function isPrivateHostLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || isPrivateAddress(h);
}

/**
 * Default sender: refuses hosts that resolve to private or loopback addresses (SSRF guard),
 * doesn't follow redirects, and gives up after a few seconds.
 */
export function httpWebhookSender(opts: { allowPrivate?: boolean } = {}): WebhookSender {
  return async ({ url, headers, body }) => {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    if (!opts.allowPrivate) {
      const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
        throw new Error('URL resolves to a private address');
      }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    await res.body?.cancel();
    return res.status;
  };
}

export type DeliverDeps = { db: Db; secret: string; send: WebhookSender; now?: () => Date };
type DeliveryOutcome = 'delivered' | 'retry' | 'failed';

/** 1 min, 2, 4 … capped at an hour. */
export const backoffMs = (attempts: number) => Math.min(2 ** (attempts - 1) * 60_000, MAX_BACKOFF_MS);

async function deliverOne(
  deps: DeliverDeps,
  tenantId: string,
  id: string,
  now: Date,
): Promise<DeliveryOutcome | null> {
  return withTenant(deps.db, tenantId, async (tx) => {
    const [row] = await tx
      .select({
        d: webhookDeliveries,
        ep: webhookEndpoints,
        ev: outingEvents,
        outing: { id: outings.id, externalRef: outings.externalRef },
      })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .innerJoin(outingEvents, eq(outingEvents.id, webhookDeliveries.eventId))
      .innerJoin(outings, eq(outings.id, outingEvents.outingId))
      .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.status, 'pending')))
      .for('update', { of: webhookDeliveries, skipLocked: true });
    if (!row || row.d.nextAttemptAt > now) return null;
    const { d, ep, ev } = row;
    if (ep.disabledAt) {
      await tx
        .update(webhookDeliveries)
        .set({ status: 'failed', lastError: 'endpoint disabled' })
        .where(eq(webhookDeliveries.id, d.id));
      return 'failed';
    }

    const body = JSON.stringify({
      id: d.id,
      type: d.eventType,
      api_version: WEBHOOK_API_VERSION,
      created_at: ev.createdAt.toISOString(),
      data: webhookData(d.eventType, ev, row.outing),
    });
    let status = 0;
    let error: string | null = null;
    try {
      const signingSecret = open(deps.secret, SECRET_PURPOSE, ep.secretEnc);
      status = await deps.send({
        url: ep.url,
        body,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'IronedOut-Webhooks/1',
          'Ironed-Event': d.eventType,
          'Ironed-Delivery': d.id,
          [SIGNATURE_HEADER]: signatureHeader(signingSecret, body, now),
        },
      });
      if (status < 200 || status >= 300) error = `HTTP ${status}`;
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 200) : 'send failed';
    }

    const attempts = d.attempts + 1;
    if (!error) {
      await tx
        .update(webhookDeliveries)
        .set({ status: 'delivered', attempts, lastStatus: status, lastError: null, deliveredAt: now })
        .where(eq(webhookDeliveries.id, d.id));
      return 'delivered';
    }
    const next = new Date(now.getTime() + backoffMs(attempts));
    const giveUp = next.getTime() - d.createdAt.getTime() > RETRY_WINDOW_MS;
    await tx
      .update(webhookDeliveries)
      .set({
        status: giveUp ? 'failed' : 'pending',
        attempts,
        lastStatus: status || null,
        lastError: error,
        nextAttemptAt: next,
      })
      .where(eq(webhookDeliveries.id, d.id));
    return giveUp ? 'failed' : 'retry';
  });
}

/** Sends due webhook deliveries for every active tenant. Safe to run concurrently. */
export async function deliverWebhooks(deps: DeliverDeps, limit = 25) {
  const now = deps.now?.() ?? new Date();
  const totals: Record<DeliveryOutcome, number> = { delivered: 0, retry: 0, failed: 0 };
  const tenantRows = await deps.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));
  for (const { id: tenantId } of tenantRows) {
    const due = await withTenant(deps.db, tenantId, (tx) =>
      tx
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now)))
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(limit),
    );
    for (const { id } of due) {
      const outcome = await deliverOne(deps, tenantId, id, now);
      if (outcome) totals[outcome]++;
    }
  }
  return totals;
}

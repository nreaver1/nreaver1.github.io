import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { audit } from '../audit';
import { courses, inviteLinks, outings, players, slots, teeTimes } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import { normalizePhone } from '../phone';
import { parseInput } from '../validation';
import type { ApiCaller } from './api-clients';
import { claimSlot, MAX_GUESTS } from './claims';
import { insertLink, revokeInviteLink, tokenFor } from './invites';
import {
  addTeeTime,
  CreateOutingInput,
  deleteTeeTime,
  INTERVALS,
  insertOuting,
  MAX_CAPACITY,
  MAX_TEE_TIMES,
  MIN_CAPACITY,
  removePlayer,
  resizeTeeTime,
  setLocked,
  updateDetails,
  type Actor,
} from './outings';

/**
 * The partner API's view of outings (SPEC §7). Partners act for the organizer of outings in their
 * own tenant: changes are recorded as the organizer's, and audited as the API client's.
 */
export type PartnerDeps = { db: Db; tenantId: string; secret: string; appUrl: string; now?: () => Date };

// ---------------------------------------------------------------------------------------------
// Inputs (snake_case: these are the public API contract and feed the OpenAPI document)
// ---------------------------------------------------------------------------------------------

const PlayerRef = z
  .object({
    name: z.string().trim().min(1).max(60).describe('Shown on the tee sheet.'),
    phone: z
      .string()
      .trim()
      .max(20)
      .optional()
      .describe(
        'Mobile number (US 10-digit or E.164). Used to match the same golfer across outings. ' +
          'Partner-supplied numbers are not verified, so no texts go to them until the golfer confirms it.',
      ),
  })
  .strict();

const Time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 07:40.')
  .describe('Local time at the course, 24-hour HH:MM.');

export const ApiCreateOutingInput = z
  .object({
    course_id: z.uuid().describe('From GET /courses.'),
    play_date: z.iso.date().describe('Local date at the course.'),
    tee_times: z
      .object({
        first: Time,
        count: z.number().int().min(1).max(MAX_TEE_TIMES).default(1),
        players_each: z.number().int().min(MIN_CAPACITY).max(MAX_CAPACITY).default(4),
        interval_minutes: z
          .number()
          .int()
          .refine((v) => (INTERVALS as readonly number[]).includes(v), 'Use 8, 9, 10 or 12.')
          .default(10)
          .describe('Minutes between consecutive tee times: 8, 9, 10 or 12.'),
      })
      .strict(),
    price_cents: z.number().int().min(0).max(999_999).nullable().default(null).describe('Display only.'),
    note: z.string().trim().max(500).default(''),
    external_ref: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullable()
      .default(null)
      .describe('Your reservation id. Echoed back in responses and webhooks; filter with ?external_ref=.'),
    organizer: PlayerRef.describe('Takes the first spot of the first tee time.'),
    players: z
      .array(PlayerRef)
      .max(MAX_TEE_TIMES * MAX_CAPACITY)
      .default([])
      .describe('Golfers already in the group; seated in order after the organizer.'),
  })
  .strict();

export const ApiUpdateOutingInput = z
  .object({
    note: z.string().trim().max(500).optional(),
    price_cents: z.number().int().min(0).max(999_999).nullable().optional(),
    locked: z
      .boolean()
      .optional()
      .describe('Locked outings take no claims, drop-outs or changes to the tee sheet.'),
  })
  .strict();

export const ApiUpdateTeeTimeInput = z
  .object({ capacity: z.number().int().min(MIN_CAPACITY).max(MAX_CAPACITY) })
  .strict();

export const ApiClaimInput = z
  .object({
    player: PlayerRef,
    guests: z.number().int().min(0).max(MAX_GUESTS).default(0).describe('Seated in the same tee time first.'),
  })
  .strict();

export const ApiCreateInviteLinkInput = z
  .object({ expires_at: z.iso.datetime({ offset: true }).nullable().default(null) })
  .strict();

export const ApiListOutingsQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  external_ref: z.string().max(200).optional(),
  from: z.iso.date().optional().describe('Play date on or after.'),
  to: z.iso.date().optional().describe('Play date on or before.'),
});

// ---------------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------------

type PlayerOut = { id: string; name: string } | null;

export type ApiSlot = {
  id: string;
  position: number;
  status: 'open' | 'taken';
  /** Only with the players:read scope. */
  player?: PlayerOut;
  guest_of?: PlayerOut;
};
export type ApiTeeTime = {
  id: string;
  starts_at: string;
  capacity: number;
  filled: number;
  slots: ApiSlot[];
};
export type ApiOuting = {
  id: string;
  external_ref: string | null;
  course: { id: string; name: string; address: string | null; city: string; region: string };
  play_date: string;
  timezone: string;
  price_cents: number | null;
  currency: string;
  note: string;
  locked: boolean;
  version: number;
  organizer?: PlayerOut;
  invite_url: string | null;
  open_count: number;
  total_count: number;
  tee_times: ApiTeeTime[];
  created_at: string;
  updated_at: string;
};

export async function loadOutingResource(
  tx: Tx,
  deps: Pick<PartnerDeps, 'secret' | 'appUrl' | 'now'>,
  outingId: string,
  opts: { includePlayers: boolean },
): Promise<ApiOuting | null> {
  if (!z.uuid().safeParse(outingId).success) return null;
  const organizer = alias(players, 'organizer');
  const [o] = await tx
    .select({
      outing: outings,
      course: {
        id: courses.id,
        name: courses.name,
        address: courses.address,
        city: courses.city,
        region: courses.region,
      },
      organizer: { id: organizer.id, name: organizer.displayName },
    })
    .from(outings)
    .innerJoin(courses, eq(courses.id, outings.courseId))
    .innerJoin(organizer, eq(organizer.id, outings.organizerPlayerId))
    .where(eq(outings.id, outingId));
  if (!o) return null;

  const host = alias(players, 'host');
  const rows = await tx
    .select({
      tee: teeTimes,
      slot: slots,
      player: { id: players.id, name: players.displayName },
      host: { id: host.id, name: host.displayName },
    })
    .from(teeTimes)
    .leftJoin(slots, eq(slots.teeTimeId, teeTimes.id))
    .leftJoin(players, eq(players.id, slots.playerId))
    .leftJoin(host, eq(host.id, slots.guestOfPlayerId))
    .where(eq(teeTimes.outingId, outingId))
    .orderBy(asc(teeTimes.startsAt), asc(teeTimes.sort), asc(slots.position));

  const now = deps.now?.() ?? new Date();
  const [link] = await tx
    .select({ id: inviteLinks.id })
    .from(inviteLinks)
    .where(
      and(
        eq(inviteLinks.outingId, outingId),
        isNull(inviteLinks.revokedAt),
        or(isNull(inviteLinks.expiresAt), gt(inviteLinks.expiresAt, now)),
      ),
    )
    .orderBy(desc(inviteLinks.createdAt))
    .limit(1);

  const tees = new Map<string, ApiTeeTime>();
  for (const r of rows) {
    let t = tees.get(r.tee.id);
    if (!t) {
      t = {
        id: r.tee.id,
        starts_at: new Date(r.tee.startsAt).toISOString(),
        capacity: r.tee.capacity,
        filled: 0,
        slots: [],
      };
      tees.set(r.tee.id, t);
    }
    if (!r.slot) continue;
    const taken = !!(r.slot.playerId || r.slot.guestOfPlayerId);
    if (taken) t.filled++;
    t.slots.push({
      id: r.slot.id,
      position: r.slot.position,
      status: taken ? 'taken' : 'open',
      ...(opts.includePlayers
        ? { player: r.slot.playerId ? r.player : null, guest_of: r.slot.guestOfPlayerId ? r.host : null }
        : {}),
    });
  }
  const teeList = [...tees.values()];
  const total = teeList.reduce((n, t) => n + t.slots.length, 0);
  const filled = teeList.reduce((n, t) => n + t.filled, 0);
  return {
    id: o.outing.id,
    external_ref: o.outing.externalRef,
    course: o.course,
    play_date: o.outing.playDate,
    timezone: o.outing.timezone,
    price_cents: o.outing.priceCents,
    currency: o.outing.currency,
    note: o.outing.note,
    locked: !!o.outing.lockedAt,
    version: o.outing.version,
    ...(opts.includePlayers ? { organizer: o.organizer } : {}),
    invite_url: link ? `${deps.appUrl}/t/${tokenFor(deps.secret, link.id)}` : null,
    open_count: total - filled,
    total_count: total,
    tee_times: teeList,
    created_at: o.outing.createdAt.toISOString(),
    updated_at: o.outing.updatedAt.toISOString(),
  };
}

const includePlayers = (caller: ApiCaller) => caller.scopes.includes('players:read');
const actorOf = (caller: ApiCaller) => `client:${caller.id}`;

export async function getOutingResource(deps: PartnerDeps, caller: ApiCaller, outingId: string) {
  const r = await withTenant(deps.db, deps.tenantId, (tx) =>
    loadOutingResource(tx, deps, outingId, { includePlayers: includePlayers(caller) }),
  );
  if (!r) throw new DomainError('not_found', 'No outing with that id.');
  return r;
}

// ---------------------------------------------------------------------------------------------
// Cursor pagination (newest first). The cursor is the last id of the previous page.
// ---------------------------------------------------------------------------------------------

const encodeCursor = (id: string) => Buffer.from(id).toString('base64url');
function decodeCursor(c: string): string {
  const id = Buffer.from(c, 'base64url').toString('utf8');
  if (!z.uuid().safeParse(id).success) throw new DomainError('invalid_input', 'That cursor isn’t valid.');
  return id;
}

export async function listOutingResources(deps: PartnerDeps, caller: ApiCaller, query: unknown) {
  const q = parseInput(ApiListOutingsQuery, query);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const where: SQL[] = [];
    if (q.cursor) where.push(lt(outings.id, decodeCursor(q.cursor)));
    if (q.external_ref) where.push(eq(outings.externalRef, q.external_ref));
    if (q.from) where.push(gte(outings.playDate, q.from));
    if (q.to) where.push(lte(outings.playDate, q.to));
    const ids = await tx
      .select({ id: outings.id })
      .from(outings)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(outings.id))
      .limit(q.limit + 1);
    const page = ids.slice(0, q.limit);
    const data: ApiOuting[] = [];
    for (const { id } of page) {
      const r = await loadOutingResource(tx, deps, id, { includePlayers: includePlayers(caller) });
      if (r) data.push(r);
    }
    return { data, next_cursor: ids.length > q.limit ? encodeCursor(page.at(-1)!.id) : null };
  });
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/** Finds the tenant's player for a phone, or makes a new one. Partner phones stay unverified. */
async function playerFor(tx: Tx, tenantId: string, ref: z.output<typeof PlayerRef>): Promise<string> {
  let phone: string | null = null;
  if (ref.phone) {
    phone = normalizePhone(ref.phone);
    if (!phone) throw new DomainError('invalid_input', `“${ref.phone}” isn’t a mobile number we can use.`);
    const [existing] = await tx.select({ id: players.id }).from(players).where(eq(players.phoneE164, phone));
    if (existing) return existing.id;
  }
  const [p] = await tx
    .insert(players)
    .values({ tenantId, displayName: ref.name, phoneE164: phone })
    .returning({ id: players.id });
  return p!.id;
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export type ApiCreateOuting = z.output<typeof ApiCreateOutingInput>;

/** Checks the request beyond its shape and maps it to the app's outing input. */
export function toOutingInput(data: ApiCreateOuting) {
  const spots = data.tee_times.count * data.tee_times.players_each;
  if (data.players.length > spots - 1) {
    throw new DomainError('invalid_input', `Only ${spots - 1} spots are left after the organizer.`, {
      fields: { players: 'Too many players for these tee times.' },
    });
  }
  return parseInput(CreateOutingInput, {
    courseId: data.course_id,
    playDate: data.play_date,
    firstTeeMinutes: minutesOf(data.tee_times.first),
    teeTimeCount: data.tee_times.count,
    playersEach: data.tee_times.players_each,
    intervalMinutes: data.tee_times.interval_minutes,
    price: data.price_cents === null ? '' : (data.price_cents / 100).toFixed(2),
    note: data.note,
  });
}

export async function createPartnerOuting(
  deps: PartnerDeps,
  caller: ApiCaller,
  input: unknown,
  opts: { via?: 'widget' } = {},
) {
  const data = parseInput(ApiCreateOutingInput, input);
  const outingInput = toOutingInput(data);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const organizerId = await playerFor(tx, deps.tenantId, data.organizer);
    const outingId = await insertOuting(
      tx,
      { tenantId: deps.tenantId, now: deps.now?.(), externalRef: data.external_ref },
      organizerId,
      outingInput,
    );
    for (const ref of data.players) {
      const playerId = await playerFor(tx, deps.tenantId, ref);
      const [open] = await tx
        .select({ id: slots.id })
        .from(slots)
        .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
        .where(and(eq(slots.outingId, outingId), isNull(slots.playerId), isNull(slots.guestOfPlayerId)))
        .orderBy(asc(teeTimes.startsAt), asc(slots.position))
        .limit(1);
      await claimSlot(tx, outingId, open!.id, playerId, 0);
    }
    await insertLink(tx, { ...deps, tenantId: deps.tenantId }, outingId, { playerId: organizerId }, null);
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: actorOf(caller),
      action: 'api.outing_created',
      target: `outing:${outingId}`,
      meta: { players: data.players.length, ...(opts.via ? { via: opts.via } : {}) },
    });
    return (await loadOutingResource(tx, deps, outingId, { includePlayers: includePlayers(caller) }))!;
  });
}

/** The organizer of an outing in this tenant, as the actor partner changes are recorded under. */
async function organizerActor(deps: PartnerDeps, outingId: string): Promise<Actor> {
  if (!z.uuid().safeParse(outingId).success) throw new DomainError('not_found', 'No outing with that id.');
  const o = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [row] = await tx
      .select({ organizer: outings.organizerPlayerId })
      .from(outings)
      .where(eq(outings.id, outingId));
    return row;
  });
  if (!o) throw new DomainError('not_found', 'No outing with that id.');
  return { playerId: o.organizer };
}

/** Outing id for a tee time or slot in this tenant (404 otherwise). */
async function outingOf(deps: PartnerDeps, kind: 'tee_time' | 'slot', id: string): Promise<string> {
  const label = kind === 'slot' ? 'spot' : 'tee time';
  if (!z.uuid().safeParse(id).success) throw new DomainError('not_found', `No ${label} with that id.`);
  const row = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [r] =
      kind === 'slot'
        ? await tx.select({ outingId: slots.outingId }).from(slots).where(eq(slots.id, id))
        : await tx.select({ outingId: teeTimes.outingId }).from(teeTimes).where(eq(teeTimes.id, id));
    return r;
  });
  if (!row) throw new DomainError('not_found', `No ${label} with that id.`);
  return row.outingId;
}

export async function updatePartnerOuting(
  deps: PartnerDeps,
  caller: ApiCaller,
  outingId: string,
  input: unknown,
) {
  const data = parseInput(ApiUpdateOutingInput, input);
  const actor = await organizerActor(deps, outingId);
  if (data.note !== undefined || data.price_cents !== undefined) {
    const current = await getOutingResource(deps, caller, outingId);
    const cents = data.price_cents === undefined ? current.price_cents : data.price_cents;
    await updateDetails(deps, actor, outingId, {
      note: data.note ?? current.note,
      price: cents === null ? '' : (cents / 100).toFixed(2),
    });
  }
  if (data.locked !== undefined) await setLocked(deps, actor, outingId, data.locked);
  return getOutingResource(deps, caller, outingId);
}

export async function addPartnerTeeTime(deps: PartnerDeps, caller: ApiCaller, outingId: string) {
  await addTeeTime(deps, await organizerActor(deps, outingId), outingId);
  return getOutingResource(deps, caller, outingId);
}

export async function updatePartnerTeeTime(
  deps: PartnerDeps,
  caller: ApiCaller,
  teeTimeId: string,
  input: unknown,
) {
  const data = parseInput(ApiUpdateTeeTimeInput, input);
  const outingId = await outingOf(deps, 'tee_time', teeTimeId);
  await resizeTeeTime(deps, await organizerActor(deps, outingId), teeTimeId, () => data.capacity);
  return getOutingResource(deps, caller, outingId);
}

export async function deletePartnerTeeTime(deps: PartnerDeps, caller: ApiCaller, teeTimeId: string) {
  const outingId = await outingOf(deps, 'tee_time', teeTimeId);
  await deleteTeeTime(deps, await organizerActor(deps, outingId), teeTimeId);
  return getOutingResource(deps, caller, outingId);
}

/** Seats a golfer the partner already knows. 409 with `reason` when the spot is gone. */
export async function claimPartnerSlot(deps: PartnerDeps, caller: ApiCaller, slotId: string, input: unknown) {
  const data = parseInput(ApiClaimInput, input);
  const outingId = await outingOf(deps, 'slot', slotId);
  let result: Awaited<ReturnType<typeof claimSlot>>;
  try {
    result = await withTenant(deps.db, deps.tenantId, async (tx) => {
      const playerId = await playerFor(tx, deps.tenantId, data.player);
      return claimSlot(tx, outingId, slotId, playerId, data.guests);
    });
  } catch (e) {
    // Hand back the current tee sheet so the caller can offer the next open spot (SPEC §4).
    if (e instanceof DomainError && e.code === 'conflict') {
      throw new DomainError(e.code, e.message, {
        ...e.details,
        outing: await getOutingResource(deps, caller, outingId),
      });
    }
    throw e;
  }
  return {
    player_id: result.playerId,
    starts_at: result.startsAt,
    guest_count: result.guestCount,
    outing: await getOutingResource(deps, caller, outingId),
  };
}

/** Frees a spot: a golfer and the guests they brought, or a single guest. Not the organizer's. */
export async function releasePartnerSlot(deps: PartnerDeps, caller: ApiCaller, slotId: string) {
  const outingId = await outingOf(deps, 'slot', slotId);
  await removePlayer(deps, await organizerActor(deps, outingId), slotId);
  return getOutingResource(deps, caller, outingId);
}

export async function createPartnerInviteLink(
  deps: PartnerDeps,
  caller: ApiCaller,
  outingId: string,
  input: unknown,
) {
  const data = parseInput(ApiCreateInviteLinkInput, input);
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  if (expiresAt && expiresAt <= (deps.now?.() ?? new Date())) {
    throw new DomainError('invalid_input', 'expires_at must be in the future.');
  }
  const actor = await organizerActor(deps, outingId);
  const link = await withTenant(deps.db, deps.tenantId, (tx) =>
    insertLink(tx, deps, outingId, actor, expiresAt),
  );
  return {
    id: link.id,
    outing_id: outingId,
    url: `${deps.appUrl}/t/${link.token}`,
    expires_at: link.expiresAt?.toISOString() ?? null,
  };
}

export async function revokePartnerInviteLink(deps: PartnerDeps, linkId: string) {
  if (!z.uuid().safeParse(linkId).success) throw new DomainError('not_found', 'No invite link with that id.');
  const link = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [l] = await tx
      .select({ outingId: inviteLinks.outingId })
      .from(inviteLinks)
      .where(eq(inviteLinks.id, linkId));
    return l;
  });
  if (!link) throw new DomainError('not_found', 'No invite link with that id.');
  await revokeInviteLink({ ...deps, secret: deps.secret }, await organizerActor(deps, link.outingId), linkId);
}

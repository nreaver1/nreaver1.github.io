import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiClients, courses, tenants } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db } from '../db/types';
import { DomainError } from '../errors';
import { normalizePhone } from '../phone';
import { hit } from '../security/rate-limit';
import { open, seal } from '../security/secretbox';
import { randomToken, sha256 } from '../security/tokens';
import { parseInput } from '../validation';
import { findActiveClient, type ApiCaller } from './api-clients';
import { beginIdempotent, findIdempotent, finishIdempotent, IDEMPOTENCY_TTL_MS } from './idempotency';
import {
  ApiCreateOutingInput,
  createPartnerOuting,
  getOutingResource,
  toOutingInput,
  type ApiCreateOuting,
  type ApiOuting,
} from './partner-outings';

/**
 * The embeddable "Invite your group" button (SPEC §7). A partner's server sends the booking to
 * POST /widget-tokens and gets back a URL to put behind the button. The token is the booking,
 * sealed with AES-256-GCM (so names and phone numbers in it aren't readable in the page or in
 * request logs) and bound to the API client that made it. Nothing is stored until the golfer taps
 * the button and confirms on our page; then the outing is created once per token, using the
 * idempotency table so a second tap (or a second person with the same page) gets the same outing.
 */

const PURPOSE = 'widget';
export const WIDGET_TOKEN_MAX_TTL_SEC = IDEMPOTENCY_TTL_MS / 1000;
const MAX_TOKEN_LENGTH = 4096;

export const ApiCreateWidgetTokenInput = ApiCreateOutingInput.extend({
  expires_in: z
    .number()
    .int()
    .min(60)
    .max(WIDGET_TOKEN_MAX_TTL_SEC)
    .default(WIDGET_TOKEN_MAX_TTL_SEC)
    .describe('Seconds until the button stops working (default and maximum: 24 hours).'),
}).strict();

const Payload = z.object({
  v: z.literal(1),
  /** api_clients.id */
  sub: z.uuid(),
  tid: z.uuid(),
  jti: z.string().min(16).max(64),
  exp: z.number().int(),
  outing: z.unknown(),
});
type Payload = z.infer<typeof Payload>;

export type WidgetDeps = { db: Db; secret: string; appUrl: string; now?: () => Date };

const nowOf = (deps: { now?: () => Date }) => deps.now?.() ?? new Date();
const keyOf = (p: Payload) => `widget:${p.jti}`;
const partnerDeps = (deps: WidgetDeps, tenantId: string) => ({
  db: deps.db,
  tenantId,
  secret: deps.secret,
  appUrl: deps.appUrl,
  now: deps.now,
});

/** The outing as it is now (the stored response is from when it was made); null if deleted. */
async function currentOuting(deps: WidgetDeps, caller: ApiCaller, stored: unknown) {
  const id = z.object({ id: z.uuid() }).safeParse(stored);
  if (!id.success) return null;
  return getOutingResource(partnerDeps(deps, caller.tenantId), caller, id.data.id).catch(() => null);
}

/** Partner API: checks the booking now (so mistakes surface on their server) and seals it. */
export async function createWidgetToken(deps: WidgetDeps, caller: ApiCaller, input: unknown) {
  const { expires_in, ...outing } = parseInput(ApiCreateWidgetTokenInput, input);
  await checkBooking(deps, caller.tenantId, outing);
  const now = nowOf(deps);
  const exp = Math.floor(now.getTime() / 1000) + expires_in;
  const payload: Payload = { v: 1, sub: caller.id, tid: caller.tenantId, jti: randomToken(22), exp, outing };
  const token = seal(deps.secret, PURPOSE, JSON.stringify(payload));
  return {
    token,
    url: `${deps.appUrl}/w/${token}`,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

async function checkBooking(deps: WidgetDeps, tenantId: string, outing: ApiCreateOuting) {
  const input = toOutingInput(outing);
  for (const p of [outing.organizer, ...outing.players]) {
    if (p.phone && !normalizePhone(p.phone)) {
      throw new DomainError('invalid_input', `“${p.phone}” isn’t a mobile number we can use.`);
    }
  }
  const course = await courseOf(deps.db, tenantId, input.courseId);
  if (!course)
    throw new DomainError('invalid_input', 'No course with that id.', {
      fields: { course_id: 'Unknown course.' },
    });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: course.timezone }).format(nowOf(deps));
  if (input.playDate < today) {
    throw new DomainError('invalid_input', 'That play date has passed.', {
      fields: { play_date: 'In the past.' },
    });
  }
}

const courseOf = (db: Db, tenantId: string, id: string) =>
  withTenant(db, tenantId, async (tx) => {
    const [c] = await tx
      .select({ name: courses.name, city: courses.city, region: courses.region, timezone: courses.timezone })
      .from(courses)
      .where(eq(courses.id, id));
    return c ?? null;
  });

/** Opens a token: null when it's malformed, forged, expired, or its client was revoked. */
async function openToken(deps: WidgetDeps, token: string) {
  if (token.length > MAX_TOKEN_LENGTH) return null;
  let payload: Payload;
  try {
    const parsed = Payload.safeParse(JSON.parse(open(deps.secret, PURPOSE, token)));
    if (!parsed.success) return null;
    payload = parsed.data;
  } catch {
    return null;
  }
  if (payload.exp * 1000 <= nowOf(deps).getTime()) return null;
  const outing = ApiCreateOutingInput.safeParse(payload.outing);
  if (!outing.success) return null;
  const client = await findActiveClient(deps.db, payload.tid, payload.sub);
  if (!client?.scopes.includes('outings:write')) return null;
  return { payload, outing: outing.data, client };
}

export type WidgetBooking = {
  partnerName: string;
  course: { name: string; city: string; region: string };
  playDate: string;
  /** Minutes after midnight, local to the course. */
  firstTeeMinutes: number;
  teeTimeCount: number;
  intervalMinutes: number;
  totalSpots: number;
  organizerName: string;
  expiresAt: string;
  /** Set once the golfer has made the outing from this token. */
  outing: ApiOuting | null;
};

/** What the hosted page shows before (and after) the outing is made. Null = link is dead. */
export async function previewWidget(deps: WidgetDeps, token: string): Promise<WidgetBooking | null> {
  const opened = await openToken(deps, token);
  if (!opened) return null;
  const { payload, outing, client } = opened;
  const input = toOutingInput(outing);
  const course = await courseOf(deps.db, client.tenantId, input.courseId);
  if (!course) return null;
  const done = await findIdempotent({ db: deps.db, tenantId: client.tenantId }, client.id, keyOf(payload));
  return {
    partnerName: client.tenantName,
    course: { name: course.name, city: course.city, region: course.region },
    playDate: input.playDate,
    firstTeeMinutes: input.firstTeeMinutes,
    teeTimeCount: input.teeTimeCount,
    intervalMinutes: input.intervalMinutes,
    totalSpots: input.teeTimeCount * input.playersEach,
    organizerName: outing.organizer.name,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    outing: done?.status === 201 ? await currentOuting(deps, client, done.body) : null,
  };
}

/**
 * The golfer tapped "Make the invite link": creates the outing as the partner's client (exactly
 * once per token) and returns it. Limited per IP so a page that leaks tokens can't be farmed.
 */
export async function redeemWidget(
  deps: WidgetDeps,
  token: string,
  ctx: { ip: string | null },
): Promise<ApiOuting> {
  const opened = await openToken(deps, token);
  if (!opened) throw new DomainError('gone', 'This button has expired. Go back and reload the page.');
  const { payload, outing, client } = opened;
  await hit(deps.db, [{ key: `widget:ip:${ctx.ip ?? 'unknown'}`, max: 20, windowSec: 3600 }], nowOf(deps));

  const idem = { db: deps.db, tenantId: client.tenantId, now: deps.now };
  const key = keyOf(payload);
  const replay = await beginIdempotent(idem, client.id, key, sha256(key));
  const { tenantName: _, ...caller } = client;
  if (replay) {
    const current = replay.status === 201 ? await currentOuting(deps, caller, replay.body) : null;
    if (current) return current;
    throw new DomainError('gone', 'That outing was deleted. Ask the booking site for a new button.');
  }
  try {
    const created = await createPartnerOuting(partnerDeps(deps, client.tenantId), caller, outing, {
      via: 'widget',
    });
    await finishIdempotent(idem, client.id, key, { status: 201, body: created });
    return created;
  } catch (e) {
    // Forget the attempt (as for a server error) so fixing the cause and tapping again works.
    await finishIdempotent(idem, client.id, key, { status: 500, body: null }).catch(() => undefined);
    throw e;
  }
}

/**
 * A fresh token for the demo booking on /developers/widget: next Saturday at Mount Pleasant,
 * three tee times. Null if the demo tenant hasn't been seeded.
 */
export async function demoWidgetToken(deps: WidgetDeps, slug: string, clientId: string) {
  const [tenant] = await deps.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) return null;
  const row = await withTenant(deps.db, tenant.id, async (tx) => {
    const [c] = await tx
      .select({ id: apiClients.id })
      .from(apiClients)
      .where(eq(apiClients.clientId, clientId));
    const [course] = await tx
      .select({ id: courses.id, timezone: courses.timezone })
      .from(courses)
      .where(eq(courses.name, 'Mount Pleasant Golf Course'));
    return c && course ? { clientId: c.id, course } : null;
  });
  if (!row) return null;
  const client = await findActiveClient(deps.db, tenant.id, row.clientId);
  if (!client) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: row.course.timezone }).format(nowOf(deps));
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
  const booking = {
    course_id: row.course.id,
    play_date: d.toISOString().slice(0, 10),
    tee_times: { first: '07:40', count: 3, players_each: 4, interval_minutes: 10 },
    price_cents: 4500,
    external_ref: `demo-${randomToken(8)}`,
    organizer: { name: 'Mike Golfer' },
    expires_in: 3600,
  };
  return { ...(await createWidgetToken(deps, client, booking)), booking };
}

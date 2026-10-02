import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { players, slots, teeTimes } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import type { PhoneVerifier } from '../notify/verify';
import { maskPhone, normalizePhone } from '../phone';
import { hit } from '../security/rate-limit';
import { sha256 } from '../security/tokens';
import { parseInput } from '../validation';
import type { RequestContext } from './accounts';
import { clearSlots, lockOuting, openSlotsInOrder, recordEvent } from './outings';

export type ClaimDeps = { db: Db; tenantId: string; verifier: PhoneVerifier; now?: () => Date };

export const MAX_GUESTS = 4;

const Name = z.string().trim().min(1, 'Tell us your name.').max(40, 'Keep it under 40 characters.');
const Phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const e164 = normalizePhone(v);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile number.' });
      return z.NEVER;
    }
    return e164;
  });

export const ClaimDetailsInput = z.object({
  slotId: z.uuid(),
  name: Name,
  phone: Phone,
  guests: z.coerce.number().int().min(0).max(MAX_GUESTS).default(0),
});
export const ClaimCodeInput = ClaimDetailsInput.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});
export const DirectClaimInput = z.object({
  slotId: z.uuid(),
  guests: z.coerce.number().int().min(0).max(MAX_GUESTS).default(0),
});

export type ClaimResult = { playerId: string; startsAt: string; guestCount: number };

const timeLabel = (startsAt: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(startsAt);

/**
 * Seats a player (plus guests) on a slot. Race-safe: the outing row is locked first so claims on
 * one outing run one at a time; the slot and open-slot reads happen under that lock; and a partial
 * unique index stops a player from holding two personal slots even if this code is bypassed.
 */
async function claimSlot(tx: Tx, outingId: string, slotId: string, playerId: string, guests: number) {
  const outing = await lockOuting(tx, outingId);
  if (outing.lockedAt) {
    throw new DomainError('conflict', 'This outing is locked in. Ask the organizer if you want in.', {
      reason: 'locked',
    });
  }
  const [mine] = await tx
    .select({ startsAt: teeTimes.startsAt })
    .from(slots)
    .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
    .where(and(eq(slots.outingId, outingId), eq(slots.playerId, playerId)));
  if (mine) {
    throw new DomainError(
      'conflict',
      `You already have a spot at ${timeLabel(mine.startsAt, outing.timezone)}.`,
      { reason: 'already_in' },
    );
  }

  const [slot] = await tx
    .select({ slot: slots, startsAt: teeTimes.startsAt })
    .from(slots)
    .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
    .where(and(eq(slots.id, slotId), eq(slots.outingId, outingId)))
    .for('update', { of: slots });
  if (!slot)
    throw new DomainError('not_found', 'That spot is gone. Pick another one.', { reason: 'slot_gone' });
  if (slot.slot.playerId || slot.slot.guestOfPlayerId) {
    throw new DomainError('conflict', 'Someone just grabbed that spot. Pick another one.', {
      reason: 'slot_taken',
    });
  }

  const others = (await openSlotsInOrder(tx, outingId, slot.slot.teeTimeId)).filter((s) => s.id !== slotId);
  if (guests > others.length) {
    throw new DomainError(
      'conflict',
      others.length === 0
        ? 'There’s no room for a guest. Just you this time.'
        : `Only ${others.length} other ${others.length === 1 ? 'spot is' : 'spots are'} open for guests.`,
      { reason: 'no_room' },
    );
  }

  const now = new Date();
  await tx.update(slots).set({ playerId, claimedAt: now }).where(eq(slots.id, slotId));
  const guestSlots = others.slice(0, guests);
  for (const g of guestSlots) {
    await tx.update(slots).set({ guestOfPlayerId: playerId, claimedAt: now }).where(eq(slots.id, g.id));
  }
  const [player] = await tx.select().from(players).where(eq(players.id, playerId));
  await recordEvent(tx, outingId, 'slot_claimed', playerId, {
    playerName: player?.displayName ?? 'Someone',
    startsAt: slot.startsAt.toISOString(),
    slotId,
    guestCount: guests,
    guestSlotIds: guestSlots.map((g) => g.id),
    guestStartsAt: guestSlots.map((g) => new Date(g.startsAt).toISOString()),
  });
  return { playerId, startsAt: slot.startsAt.toISOString(), guestCount: guests };
}

/** Cheap pre-check so we don't send a code for a spot that's already gone. */
async function assertClaimable(tx: Tx, outingId: string, slotId: string, guests: number) {
  const outing = await lockOuting(tx, outingId);
  if (outing.lockedAt) throw new DomainError('conflict', 'This outing is locked in.', { reason: 'locked' });
  const open = await openSlotsInOrder(tx, outingId, null);
  if (!open.some((s) => s.id === slotId)) {
    throw new DomainError('conflict', 'Someone just grabbed that spot. Pick another one.', {
      reason: 'slot_taken',
    });
  }
  if (guests > open.length - 1) {
    throw new DomainError('conflict', `Only ${open.length - 1} other spots are open for guests.`, {
      reason: 'no_room',
    });
  }
}

/** Step 1 of the claim sheet: validate and text (or, in demo mode, show) a code. */
export async function startClaim(deps: ClaimDeps, outingId: string, input: unknown, ctx: RequestContext) {
  const data = parseInput(ClaimDetailsInput, input);
  const now = deps.now?.() ?? new Date();
  await hit(
    deps.db,
    [
      { key: `code:phone:${sha256(data.phone)}`, max: 5, windowSec: 3600 },
      { key: `code:ip:${ctx.ip ?? 'unknown'}`, max: 20, windowSec: 3600 },
    ],
    now,
  );
  await withTenant(deps.db, deps.tenantId, (tx) => assertClaimable(tx, outingId, data.slotId, data.guests));
  const started = await deps.verifier.start(data.phone, 'claim');
  return { phoneMasked: maskPhone(data.phone), demoCode: started.demoCode };
}

/** Step 2: check the code, find or create the player for that phone, and claim. */
export async function confirmClaim(
  deps: ClaimDeps,
  outingId: string,
  input: unknown,
  ctx: RequestContext,
): Promise<ClaimResult> {
  const data = parseInput(ClaimCodeInput, input);
  await hit(
    deps.db,
    [{ key: `code-check:ip:${ctx.ip ?? 'unknown'}`, max: 30, windowSec: 3600 }],
    deps.now?.(),
  );
  const result = await deps.verifier.check(data.phone, data.code, 'claim');
  if (result === 'wrong') {
    throw new DomainError('invalid_input', "That code didn't match.", {
      fields: { code: "That code didn't match." },
    });
  }
  if (result === 'expired') {
    throw new DomainError('gone', 'That code expired or had too many tries. Send a new one.', {
      fields: { code: 'That code expired. Send a new one.' },
    });
  }

  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const now = deps.now?.() ?? new Date();
    const [existing] = await tx.select().from(players).where(eq(players.phoneE164, data.phone));
    let playerId: string;
    if (existing) {
      playerId = existing.id;
      await tx
        .update(players)
        .set({
          phoneVerifiedAt: now,
          // Phone-only players go by whatever name they typed last; account holders keep theirs.
          ...(existing.userId ? {} : { displayName: data.name }),
        })
        .where(eq(players.id, existing.id));
    } else {
      const [p] = await tx
        .insert(players)
        .values({
          tenantId: deps.tenantId,
          displayName: data.name,
          phoneE164: data.phone,
          phoneVerifiedAt: now,
        })
        .returning({ id: players.id });
      playerId = p!.id;
    }
    return claimSlot(tx, outingId, data.slotId, playerId, data.guests);
  });
}

/** Claim as a player we already know (signed in, or a verified device): no code needed. */
export async function claimAsPlayer(
  deps: Pick<ClaimDeps, 'db' | 'tenantId'>,
  outingId: string,
  playerId: string,
  input: unknown,
): Promise<ClaimResult> {
  const data = parseInput(DirectClaimInput, input);
  return withTenant(deps.db, deps.tenantId, (tx) =>
    claimSlot(tx, outingId, data.slotId, playerId, data.guests),
  );
}

/** Drop out: frees the player's spot and their guests' spots. */
export async function dropOut(deps: Pick<ClaimDeps, 'db' | 'tenantId'>, outingId: string, playerId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const outing = await lockOuting(tx, outingId);
    if (outing.lockedAt) {
      throw new DomainError('conflict', 'This outing is locked in. Ask the organizer to unlock it first.');
    }
    if (outing.organizerPlayerId === playerId) {
      throw new DomainError('conflict', 'You’re the organizer, so you can’t drop out of your own outing.');
    }
    const [mine] = await tx
      .select({ id: slots.id, startsAt: teeTimes.startsAt })
      .from(slots)
      .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
      .where(and(eq(slots.outingId, outingId), eq(slots.playerId, playerId), isNull(slots.guestOfPlayerId)))
      .for('update', { of: slots });
    if (!mine) throw new DomainError('conflict', 'You’re not on this tee sheet.');
    const guestSlots = await tx
      .select({ id: slots.id })
      .from(slots)
      .where(and(eq(slots.outingId, outingId), eq(slots.guestOfPlayerId, playerId)));
    const ids = [mine.id, ...guestSlots.map((g) => g.id)];
    await clearSlots(tx, ids);
    const [player] = await tx.select().from(players).where(eq(players.id, playerId));
    await recordEvent(tx, outingId, 'slot_released', playerId, {
      playerName: player?.displayName ?? 'Someone',
      startsAt: mine.startsAt.toISOString(),
      guestCount: guestSlots.length,
      slotIds: ids,
    });
  });
}

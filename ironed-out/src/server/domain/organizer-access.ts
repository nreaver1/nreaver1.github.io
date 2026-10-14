import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../audit';
import { outings, players } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Tx } from '../db/types';
import { DomainError } from '../errors';
import { maskPhone, normalizePhone } from '../phone';
import { hit } from '../security/rate-limit';
import { sha256 } from '../security/tokens';
import { parseInput } from '../validation';
import type { RequestContext } from './accounts';
import type { ClaimDeps } from './claims';

/**
 * Organizers without an account: the booker of an outing a partner made (API or widget). They
 * manage the outing from the invite page once their browser is remembered as the organizer (a
 * device cookie). The widget does that when they make the link; on any other device they confirm
 * the mobile number the partner sent with the booking, the same way invitees confirm theirs.
 * Organizers with an account sign in instead, so this never applies to them.
 */

const PhoneInput = z.object({
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const e164 = normalizePhone(v);
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile number.' });
        return z.NEVER;
      }
      return e164;
    }),
});
const CodeInput = PhoneInput.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

const NOT_THEIRS = 'That isn’t the number this outing was booked with.';

async function accountlessOrganizer(tx: Tx, outingId: string) {
  if (!z.uuid().safeParse(outingId).success) return null;
  const [row] = await tx
    .select({ id: players.id, userId: players.userId, phone: players.phoneE164 })
    .from(outings)
    .innerJoin(players, eq(players.id, outings.organizerPlayerId))
    .where(eq(outings.id, outingId));
  return row && !row.userId ? row : null;
}

/** Whether "Organizing this one? Confirm your number" can work for this outing. */
export async function organizerCanConfirm(deps: Pick<ClaimDeps, 'db' | 'tenantId'>, outingId: string) {
  const o = await withTenant(deps.db, deps.tenantId, (tx) => accountlessOrganizer(tx, outingId));
  return !!o?.phone;
}

async function organizerFor(deps: Pick<ClaimDeps, 'db' | 'tenantId'>, outingId: string, phone: string) {
  const o = await withTenant(deps.db, deps.tenantId, (tx) => accountlessOrganizer(tx, outingId));
  if (!o?.phone || o.phone !== phone) {
    throw new DomainError('invalid_input', NOT_THEIRS, { fields: { phone: NOT_THEIRS } });
  }
  return o;
}

/** Step 1: the number must be the organizer's; then text (or, in demo mode, show) a code. */
export async function startOrganizerConfirm(
  deps: ClaimDeps,
  outingId: string,
  input: unknown,
  ctx: RequestContext,
) {
  const { phone } = parseInput(PhoneInput, input);
  await hit(
    deps.db,
    [
      { key: `code:phone:${sha256(phone)}`, max: 5, windowSec: 3600 },
      { key: `code:ip:${ctx.ip ?? 'unknown'}`, max: 20, windowSec: 3600 },
    ],
    deps.now?.(),
  );
  await organizerFor(deps, outingId, phone);
  const started = await deps.verifier.start(phone, 'claim');
  return { phoneMasked: maskPhone(phone), demoCode: started.demoCode };
}

/** Step 2: check the code, mark the number verified (so alerts can reach them) and return them. */
export async function confirmOrganizer(
  deps: ClaimDeps,
  outingId: string,
  input: unknown,
  ctx: RequestContext,
): Promise<{ playerId: string }> {
  const data = parseInput(CodeInput, input);
  await hit(
    deps.db,
    [{ key: `code-check:ip:${ctx.ip ?? 'unknown'}`, max: 30, windowSec: 3600 }],
    deps.now?.(),
  );
  const organizer = await organizerFor(deps, outingId, data.phone);
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
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await tx
      .update(players)
      .set({ phoneVerifiedAt: deps.now?.() ?? new Date() })
      .where(eq(players.id, organizer.id));
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `player:${organizer.id}`,
      action: 'outing.organizer_confirmed',
      target: `outing:${outingId}`,
      ip: ctx.ip,
      meta: { via: 'phone' },
    });
  });
  return { playerId: organizer.id };
}

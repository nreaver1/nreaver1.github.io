'use server';

import { revalidatePath } from 'next/cache';
import { claimAsPlayer, confirmClaim, dropOut, startClaim } from '@/server/domain/claims';
import { markSeen, viewerKeyOf } from '@/server/domain/feed';
import { DomainError, isDomainError } from '@/server/errors';
import { dispatchSoon } from '@/web/dispatch';
import { resolveInvite } from '@/web/invite';
import { requestContext } from '@/web/session';
import { clearDeviceCookie, ensureAnonKey, setDeviceCookie } from '@/web/viewer';

export type ClaimActionState = {
  ok?: boolean;
  error?: string;
  fields?: Record<string, string>;
  /** Why a claim failed, e.g. "slot_taken" so the sheet can offer the next open spot. */
  reason?: string;
  demoCode?: string;
  phoneMasked?: string;
  startsAt?: string;
  guestCount?: number;
};

const refresh = (token: string) => {
  revalidatePath(`/t/${token}`);
  revalidatePath('/home');
  dispatchSoon();
};

async function outingFor(token: string) {
  const invite = await resolveInvite(token);
  if (!invite) throw new DomainError('gone', 'This invite link has expired or was turned off.');
  return invite;
}

function fail(e: unknown, token?: string): ClaimActionState {
  if (isDomainError(e)) {
    // The sheet is stale: refresh it so the next open spot is real.
    if (token && (e.details?.reason === 'slot_taken' || e.details?.reason === 'slot_gone')) refresh(token);
    return {
      error: e.message,
      fields: e.details?.fields as Record<string, string> | undefined,
      reason: e.details?.reason as string | undefined,
    };
  }
  throw e;
}

type Details = { slotId: string; name: string; phone: string; guests: number };

export async function startClaimAction(token: string, input: Details): Promise<ClaimActionState> {
  try {
    const { services, outingId } = await outingFor(token);
    const r = await startClaim(services, outingId, input, await requestContext());
    return { ok: true, phoneMasked: r.phoneMasked, demoCode: services.smsDemo ? r.demoCode : undefined };
  } catch (e) {
    return fail(e, token);
  }
}

export async function confirmClaimAction(
  token: string,
  input: Details & { code: string },
): Promise<ClaimActionState> {
  try {
    const { services, outingId } = await outingFor(token);
    const r = await confirmClaim(services, outingId, input, await requestContext());
    await setDeviceCookie(r.playerId);
    refresh(token);
    return { ok: true, startsAt: r.startsAt, guestCount: r.guestCount };
  } catch (e) {
    return fail(e, token);
  }
}

/** For viewers we already know (signed in or a verified device): no code. */
export async function claimDirectAction(
  token: string,
  input: { slotId: string; guests: number },
): Promise<ClaimActionState> {
  try {
    const { services, outingId, viewer } = await outingFor(token);
    if (!viewer.playerId) throw new DomainError('unauthorized', 'Confirm your number first.');
    const r = await claimAsPlayer(services, outingId, viewer.playerId, input);
    refresh(token);
    return { ok: true, startsAt: r.startsAt, guestCount: r.guestCount };
  } catch (e) {
    return fail(e, token);
  }
}

export async function dropOutAction(token: string): Promise<ClaimActionState> {
  try {
    const { services, outingId, viewer } = await outingFor(token);
    if (!viewer.playerId) throw new DomainError('unauthorized', 'We don’t know who you are on this device.');
    await dropOut(services, outingId, viewer.playerId);
    refresh(token);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** "Not you?" — forget the verified device on this browser. */
export async function forgetDeviceAction(token: string): Promise<void> {
  await clearDeviceCookie();
  revalidatePath(`/t/${token}`);
}

/** "Got it", a first visit (sets the baseline), or after a claim. */
export async function markSeenAction(token: string, lastEventId: number): Promise<void> {
  const invite = await resolveInvite(token);
  if (!invite) return;
  const { services, outingId, viewer } = invite;
  const key = viewer.playerId ?? viewerKeyOf(null, await ensureAnonKey());
  if (key) await markSeen(services, outingId, key, lastEventId);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '@/components/outing/organizer-actions';
import { claimAsPlayer, confirmClaim, dropOut, startClaim } from '@/server/domain/claims';
import { markSeen, viewerKeyOf } from '@/server/domain/feed';
import { confirmOrganizer, startOrganizerConfirm } from '@/server/domain/organizer-access';
import {
  addTeeTime,
  changeCapacity,
  deleteOuting,
  deleteTeeTime,
  removePlayer,
  setLocked,
  type Actor,
} from '@/server/domain/outings';
import { DomainError, isDomainError } from '@/server/errors';
import { dispatchSoon } from '@/web/dispatch';
import { resolveInvite } from '@/web/invite';
import type { Services } from '@/web/services';
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

// ---------------------------------------------------------------------------------------------
// Organizer controls on the invite page. These work for whoever the page knows as the organizer:
// a signed-in organizer, or a booker without an account whose device is remembered (partner
// outings). The domain checks the actor really is the organizer.
// ---------------------------------------------------------------------------------------------

async function asOrganizer(
  token: string,
  run: (services: Services, actor: Actor, outingId: string) => Promise<unknown>,
): Promise<ActionResult> {
  try {
    const { services, outingId, viewer } = await outingFor(token);
    if (!viewer.playerId) throw new DomainError('forbidden', 'Only the organizer can change this outing.');
    const { ip } = await requestContext();
    await run(services, { playerId: viewer.playerId, ip }, outingId);
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
  refresh(token);
  return {};
}

export async function inviteAddTeeTimeAction(token: string): Promise<ActionResult> {
  return asOrganizer(token, (s, actor, outingId) => addTeeTime(s, actor, outingId));
}

export async function inviteChangeCapacityAction(
  token: string,
  teeTimeId: string,
  delta: 1 | -1,
): Promise<ActionResult> {
  return asOrganizer(token, (s, actor) => changeCapacity(s, actor, teeTimeId, delta === 1 ? 1 : -1));
}

export async function inviteDeleteTeeTimeAction(token: string, teeTimeId: string): Promise<ActionResult> {
  return asOrganizer(token, (s, actor) => deleteTeeTime(s, actor, teeTimeId));
}

export async function inviteRemovePlayerAction(token: string, slotId: string): Promise<ActionResult> {
  return asOrganizer(token, (s, actor) => removePlayer(s, actor, slotId));
}

export async function inviteSetLockedAction(token: string, locked: boolean): Promise<ActionResult> {
  return asOrganizer(token, (s, actor, outingId) => setLocked(s, actor, outingId, locked));
}

/** Deletes the outing; the invite link dies with it, so land on a "deleted" note instead. */
export async function inviteDeleteOutingAction(token: string): Promise<ActionResult> {
  const r = await asOrganizer(token, (s, actor, outingId) => deleteOuting(s, actor, outingId));
  if (r.error) return r;
  redirect(`/t/${token}?deleted=1`);
}

/** "Organizing this one?" step 1: the booker types the number the outing was booked with. */
export async function startOrganizerConfirmAction(
  token: string,
  input: { phone: string },
): Promise<ClaimActionState> {
  try {
    const { services, outingId } = await outingFor(token);
    const r = await startOrganizerConfirm(services, outingId, input, await requestContext());
    return { ok: true, phoneMasked: r.phoneMasked, demoCode: services.smsDemo ? r.demoCode : undefined };
  } catch (e) {
    return fail(e);
  }
}

/** Step 2: the code checks out, so remember this browser as the organizer. */
export async function confirmOrganizerAction(
  token: string,
  input: { phone: string; code: string },
): Promise<ClaimActionState> {
  try {
    const { services, outingId } = await outingFor(token);
    const r = await confirmOrganizer(services, outingId, input, await requestContext());
    await setDeviceCookie(r.playerId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/t/${token}`);
  return { ok: true };
}

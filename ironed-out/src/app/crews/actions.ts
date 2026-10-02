'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createCrew, joinCrew, leaveCrew, removeCrewMember, rotateCrewInvite } from '@/server/domain/crews';
import { isDomainError } from '@/server/errors';
import { str, toFormState, type FormState } from '@/web/form-state';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';

export type CrewActionResult = { error?: string };

async function run(fn: (userId: string) => Promise<void>): Promise<CrewActionResult> {
  const user = await requireUser('/crews');
  try {
    await fn(user.userId);
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
  revalidatePath('/crews', 'layout');
  revalidatePath('/home');
  return {};
}

export async function createCrewAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/crews/new');
  let id: string;
  try {
    id = await createCrew(await getServices(), user.userId, { name: str(form, 'name') });
  } catch (e) {
    return toFormState(e, { name: str(form, 'name') });
  }
  revalidatePath('/home');
  redirect(`/crews/${id}`);
}

export async function joinCrewAction(token: string): Promise<CrewActionResult> {
  const user = await requireUser(`/g/${token}`);
  let id: string;
  try {
    id = await joinCrew(await getServices(), user.userId, token);
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
  revalidatePath('/home');
  redirect(`/crews/${id}`);
}

export async function rotateCrewLinkAction(crewId: string) {
  return run(async (userId) => rotateCrewInvite(await getServices(), userId, crewId));
}

export async function removeCrewMemberAction(crewId: string, memberUserId: string) {
  return run(async (userId) => removeCrewMember(await getServices(), userId, crewId, memberUserId));
}

export async function leaveCrewAction(crewId: string): Promise<CrewActionResult> {
  const r = await run(async (userId) => leaveCrew(await getServices(), userId, crewId));
  if (r.error) return r;
  redirect('/crews');
}

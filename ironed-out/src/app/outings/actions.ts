'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SeedProvider, type CourseResult } from '@/server/domain/courses';
import {
  addTeeTime,
  changeCapacity,
  createOuting,
  deleteTeeTime,
  removePlayer,
  setLocked,
  updateDetails,
} from '@/server/domain/outings';
import { isDomainError } from '@/server/errors';
import { str, toFormState, type FormState } from '@/web/form-state';
import { getServices } from '@/web/services';
import { requestContext, requireUser } from '@/web/session';

export type ActionResult = { error?: string };

async function organizerAction(run: (actor: { playerId: string; ip: string | null }) => Promise<void>) {
  const user = await requireUser();
  const { ip } = await requestContext();
  try {
    await run({ playerId: user.playerId, ip });
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
  revalidatePath('/outings/[id]', 'page');
  revalidatePath('/home');
  return {};
}

export async function searchCoursesAction(query: string, scope: 'near' | 'all'): Promise<CourseResult[]> {
  await requireUser();
  const { db } = await getServices();
  try {
    return await new SeedProvider(db).search({ query: query.slice(0, 80), scope });
  } catch (e) {
    if (isDomainError(e)) return [];
    throw e;
  }
}

export async function createOutingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/outings/new');
  const input = {
    courseId: str(form, 'courseId'),
    playDate: str(form, 'playDate'),
    firstTeeMinutes: str(form, 'firstTeeMinutes'),
    teeTimeCount: str(form, 'teeTimeCount'),
    playersEach: str(form, 'playersEach'),
    intervalMinutes: str(form, 'intervalMinutes'),
    price: str(form, 'price'),
    note: str(form, 'note'),
  };
  let id: string;
  try {
    id = await createOuting(await getServices(), { playerId: user.playerId }, input);
  } catch (e) {
    return toFormState(e, { price: input.price, note: input.note });
  }
  revalidatePath('/home');
  redirect(`/outings/${id}`);
}

export async function addTeeTimeAction(outingId: string): Promise<ActionResult> {
  return organizerAction(async (actor) => addTeeTime(await getServices(), actor, outingId));
}

export async function changeCapacityAction(teeTimeId: string, delta: 1 | -1): Promise<ActionResult> {
  return organizerAction(async (actor) =>
    changeCapacity(await getServices(), actor, teeTimeId, delta === 1 ? 1 : -1),
  );
}

export async function deleteTeeTimeAction(teeTimeId: string): Promise<ActionResult> {
  return organizerAction(async (actor) => deleteTeeTime(await getServices(), actor, teeTimeId));
}

export async function removePlayerAction(slotId: string): Promise<ActionResult> {
  return organizerAction(async (actor) => removePlayer(await getServices(), actor, slotId));
}

export async function setLockedAction(outingId: string, locked: boolean): Promise<ActionResult> {
  return organizerAction(async (actor) => setLocked(await getServices(), actor, outingId, locked));
}

export async function updateDetailsAction(
  outingId: string,
  price: string,
  note: string,
): Promise<ActionResult> {
  return organizerAction(async (actor) =>
    updateDetails(await getServices(), actor, outingId, { price, note }),
  );
}

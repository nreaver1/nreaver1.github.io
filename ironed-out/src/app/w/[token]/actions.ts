'use server';

import { redirect } from 'next/navigation';
import { redeemWidget, widgetOrganizer } from '@/server/domain/widget';
import { dispatchSoon } from '@/web/dispatch';
import { toFormState, type FormState } from '@/web/form-state';
import { getServices } from '@/web/services';
import { requestContext } from '@/web/session';
import { setDeviceCookie } from '@/web/viewer';

/**
 * Remembers this browser as the outing's organizer, so the invite page shows the organizer
 * controls. Returns the invite page path, or null if the token can't manage anything.
 */
async function rememberOrganizer(token: string) {
  const { db, secret, appUrl } = await getServices();
  const organizer = await widgetOrganizer({ db, secret, appUrl }, token, await requestContext());
  if (!organizer) return null;
  await setDeviceCookie(organizer.playerId);
  return organizer.invitePath;
}

/** "Make the invite link" on the partner widget page: creates the outing, then shows the link. */
export async function makeOutingAction(token: string, _prev: FormState): Promise<FormState> {
  try {
    const { db, secret, appUrl } = await getServices();
    await redeemWidget({ db, secret, appUrl }, token, await requestContext());
    await rememberOrganizer(token);
  } catch (e) {
    return toFormState(e);
  }
  dispatchSoon();
  redirect(`/w/${token}`);
}

/** "Manage the tee sheet" after the link is made (also from another device with the same button). */
export async function manageOutingAction(token: string, _prev: FormState): Promise<FormState> {
  let path: string | null;
  try {
    path = await rememberOrganizer(token);
  } catch (e) {
    return toFormState(e);
  }
  if (!path) return { error: 'This button has expired. Go back and reload the page.' };
  redirect(path);
}

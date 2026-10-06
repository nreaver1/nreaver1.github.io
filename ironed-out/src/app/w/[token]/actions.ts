'use server';

import { redirect } from 'next/navigation';
import { redeemWidget } from '@/server/domain/widget';
import { dispatchSoon } from '@/web/dispatch';
import { toFormState, type FormState } from '@/web/form-state';
import { getServices } from '@/web/services';
import { requestContext } from '@/web/session';

/** "Make the invite link" on the partner widget page: creates the outing, then shows the link. */
export async function makeOutingAction(token: string, _prev: FormState): Promise<FormState> {
  try {
    const { db, secret, appUrl } = await getServices();
    await redeemWidget({ db, secret, appUrl }, token, await requestContext());
  } catch (e) {
    return toFormState(e);
  }
  dispatchSoon();
  redirect(`/w/${token}`);
}

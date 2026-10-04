'use server';

import { redirect } from 'next/navigation';
import { deleteAccount } from '@/server/domain/account-data';
import { str, toFormState, type FormState } from '@/web/form-state';
import { getServices } from '@/web/services';
import { clearSessionCookie, requestContext, requireUser } from '@/web/session';
import { clearDeviceCookie } from '@/web/viewer';

export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/settings/account');
  try {
    await deleteAccount(
      await getServices(),
      user.userId,
      { password: str(form, 'password') },
      await requestContext(),
    );
  } catch (e) {
    return toFormState(e);
  }
  await clearSessionCookie();
  await clearDeviceCookie();
  redirect('/?deleted=1');
}

'use server';

import { redirect } from 'next/navigation';
import { logIn, logOut, requestPasswordReset, resetPassword, signUp } from '@/server/domain/accounts';
import { safeNext, str, toFormState, type FormState } from '@/web/form-state';
import { getServices } from '@/web/services';
import { clearSessionCookie, requestContext, sessionToken, setSessionCookie } from '@/web/session';

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { name: str(form, 'name'), email: str(form, 'email') };
  try {
    const { session } = await signUp(
      await getServices(),
      { ...values, password: str(form, 'password') },
      await requestContext(),
    );
    await setSessionCookie(session);
  } catch (e) {
    return toFormState(e, values);
  }
  redirect(safeNext(str(form, 'next')));
}

export async function logInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: str(form, 'email') };
  try {
    const { session } = await logIn(
      await getServices(),
      { ...values, password: str(form, 'password') },
      await requestContext(),
    );
    await setSessionCookie(session);
  } catch (e) {
    return toFormState(e, values);
  }
  redirect(safeNext(str(form, 'next')));
}

export async function logOutAction(): Promise<void> {
  await logOut(await getServices(), await sessionToken(), await requestContext());
  await clearSessionCookie();
  redirect('/');
}

export async function forgotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: str(form, 'email') };
  try {
    await requestPasswordReset(await getServices(), values, await requestContext());
  } catch (e) {
    return toFormState(e, values);
  }
  return {
    ok: true,
    values,
    message: 'If that email has an account, a reset link is on its way. It expires in 30 minutes.',
  };
}

export async function resetAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { session } = await resetPassword(
      await getServices(),
      { token: str(form, 'token'), password: str(form, 'password') },
      await requestContext(),
    );
    await setSessionCookie(session);
  } catch (e) {
    return toFormState(e);
  }
  redirect('/home');
}

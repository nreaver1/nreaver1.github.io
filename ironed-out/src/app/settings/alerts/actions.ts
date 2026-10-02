'use server';

import { revalidatePath } from 'next/cache';
import { confirmPhoneVerification, startPhoneVerification } from '@/server/domain/accounts';
import { setAlertPref, setQuietHours, setSmsOptOut } from '@/server/domain/notifications';
import { isDomainError } from '@/server/errors';
import { getServices } from '@/web/services';
import { requestContext, requireUser } from '@/web/session';

export type AlertsActionState = {
  ok?: boolean;
  error?: string;
  fields?: Record<string, string>;
  demoCode?: string;
  phoneMasked?: string;
};

function fail(e: unknown): AlertsActionState {
  if (isDomainError(e))
    return { error: e.message, fields: e.details?.fields as Record<string, string> | undefined };
  throw e;
}

export async function setAlertPrefAction(
  type: string,
  channel: string,
  on: boolean,
): Promise<AlertsActionState> {
  const user = await requireUser('/settings/alerts');
  try {
    await setAlertPref(await getServices(), user.playerId, { type, channel, on });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setQuietHoursAction(on: boolean): Promise<AlertsActionState> {
  const user = await requireUser('/settings/alerts');
  await setQuietHours(await getServices(), user.playerId, on);
  return { ok: true };
}

export async function resumeTextsAction(): Promise<AlertsActionState> {
  const user = await requireUser('/settings/alerts');
  await setSmsOptOut(await getServices(), user.playerId, false);
  revalidatePath('/settings/alerts');
  return { ok: true };
}

export async function startPhoneAction(phone: string): Promise<AlertsActionState> {
  const user = await requireUser('/settings/alerts');
  try {
    const services = await getServices();
    const r = await startPhoneVerification(services, user.userId, { phone }, await requestContext());
    return { ok: true, phoneMasked: r.phoneMasked, demoCode: services.smsDemo ? r.demoCode : undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmPhoneAction(phone: string, code: string): Promise<AlertsActionState> {
  const user = await requireUser('/settings/alerts');
  try {
    await confirmPhoneVerification(await getServices(), user.userId, { phone, code }, await requestContext());
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/settings/alerts');
  return { ok: true };
}

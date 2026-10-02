import 'server-only';
import { after } from 'next/server';
import { runDispatch } from '@/server/domain/notifications';
import { getServices } from './services';

/** Runs the dispatcher (reminders + anything due). */
export async function dispatchNow() {
  const s = await getServices();
  return runDispatch({ db: s.db, sms: s.sms, mailer: s.mailer, secret: s.secret, appUrl: s.appUrl });
}

/**
 * After the response is sent, deliver anything that's already due (e.g. a "you were removed"
 * text). Coalesced alerts wait their 2 minutes and go out on the next scheduled run.
 */
export function dispatchSoon() {
  after(async () => {
    try {
      await dispatchNow();
    } catch (e) {
      console.error('dispatch failed', e instanceof Error ? e.message : 'unknown error');
    }
  });
}

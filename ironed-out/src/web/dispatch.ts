import 'server-only';
import { after } from 'next/server';
import { runDispatch } from '@/server/domain/notifications';
import { deliverWebhooks, httpWebhookSender } from '@/server/domain/webhooks';
import { getServices } from './services';

/** Runs the dispatcher (reminders + anything due) and sends due partner webhooks. */
export async function dispatchNow() {
  const s = await getServices();
  const notifications = await runDispatch({
    db: s.db,
    sms: s.sms,
    mailer: s.mailer,
    secret: s.secret,
    appUrl: s.appUrl,
  });
  const webhooks = await deliverWebhooks({
    db: s.db,
    secret: s.secret,
    // Local receivers are fine in development; production only calls public hosts.
    send: httpWebhookSender({ allowPrivate: process.env.NODE_ENV !== 'production' }),
  });
  return { ...notifications, webhooks };
}

/**
 * After the response is sent, deliver anything that's already due (e.g. a "you were removed"
 * text, or webhooks). Coalesced alerts wait their 2 minutes and go out on the next scheduled run.
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

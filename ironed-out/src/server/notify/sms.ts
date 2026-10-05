import { createHmac } from 'node:crypto';
import { safeEqual } from '../security/tokens';
import { toGsm7 } from './gsm';

/**
 * Sends texts (alerts and claim codes). Swappable: demo (records only) or Twilio Messaging.
 * Both normalize the body to GSM-7 (see gsm.ts) so a stray ’ doesn't triple the segment count.
 */
export interface SmsSender {
  readonly kind: 'demo' | 'twilio';
  send(toE164: string, body: string): Promise<{ providerId: string | null }>;
}

/** SMS demo mode: nothing leaves the server. The dispatcher still records the text as sent. */
export class DemoSms implements SmsSender {
  readonly kind = 'demo';
  readonly sent: { to: string; body: string }[] = [];
  async send(to: string, body: string) {
    this.sent.push({ to, body: toGsm7(body) });
    return { providerId: null };
  }
}

/** Twilio Programmable Messaging via a Messaging Service (handles STOP/HELP with Advanced Opt-Out). */
export class TwilioSms implements SmsSender {
  readonly kind = 'twilio';
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly messagingServiceSid: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, body: string) {
    const res = await this.fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          MessagingServiceSid: this.messagingServiceSid,
          Body: toGsm7(body),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`SMS provider responded ${res.status}`);
    const json = (await res.json()) as { sid?: string };
    return { providerId: json.sid ?? null };
  }
}

/**
 * Validates `X-Twilio-Signature`: base64 HMAC-SHA1 of the full URL followed by each POST param
 * name+value, sorted by name (https://www.twilio.com/docs/usage/security#validating-requests).
 */
export function validTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  return safeEqual(expected, signature);
}

export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'];
export const START_WORDS = ['START', 'UNSTOP', 'YES'];
export const HELP_WORDS = ['HELP', 'INFO'];

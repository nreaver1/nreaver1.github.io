import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { verificationCodes } from '../db/schema';
import type { Db } from '../db/types';
import { hmac, safeEqual } from '../security/tokens';

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export type VerifyStart = {
  /** Only in SMS demo mode: the code to show on screen instead of texting it. */
  demoCode?: string;
};

export type VerifyCheck = 'ok' | 'wrong' | 'expired';

/** Sends and checks 6-digit phone codes. Swappable: demo (our DB) or Twilio Verify. */
export interface PhoneVerifier {
  readonly kind: 'demo' | 'twilio';
  start(phoneE164: string, purpose: 'claim' | 'phone'): Promise<VerifyStart>;
  check(phoneE164: string, code: string, purpose: 'claim' | 'phone'): Promise<VerifyCheck>;
}

/**
 * Issues codes from our own table and hands them back for on-screen display. Used until a
 * Twilio account is connected. Codes are keyed-hashed, expire in 10 minutes and allow 5 tries.
 */
export class DemoVerifier implements PhoneVerifier {
  readonly kind = 'demo';
  constructor(
    private readonly db: Db,
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private hash(phone: string, code: string) {
    return hmac(this.secret, `code:${phone}:${code}`).toString('hex');
  }

  async start(phoneE164: string, purpose: 'claim' | 'phone'): Promise<VerifyStart> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.insert(verificationCodes).values({
      phoneE164,
      purpose,
      codeHash: this.hash(phoneE164, code),
      expiresAt: new Date(this.now().getTime() + CODE_TTL_MINUTES * 60_000),
    });
    return { demoCode: code };
  }

  async check(phoneE164: string, code: string, purpose: 'claim' | 'phone'): Promise<VerifyCheck> {
    const [row] = await this.db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.phoneE164, phoneE164),
          eq(verificationCodes.purpose, purpose),
          isNull(verificationCodes.consumedAt),
          gt(verificationCodes.expiresAt, this.now()),
        ),
      )
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);
    if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return 'expired';
    if (!safeEqual(row.codeHash, this.hash(phoneE164, code))) {
      await this.db
        .update(verificationCodes)
        .set({ attempts: sql`${verificationCodes.attempts} + 1` })
        .where(eq(verificationCodes.id, row.id));
      return row.attempts + 1 >= CODE_MAX_ATTEMPTS ? 'expired' : 'wrong';
    }
    const [used] = await this.db
      .update(verificationCodes)
      .set({ consumedAt: this.now() })
      .where(and(eq(verificationCodes.id, row.id), isNull(verificationCodes.consumedAt)))
      .returning({ id: verificationCodes.id });
    return used ? 'ok' : 'expired';
  }
}

/** Twilio Verify (https://www.twilio.com/docs/verify/api). Twilio generates, sends and checks codes. */
export class TwilioVerifier implements PhoneVerifier {
  readonly kind = 'twilio';
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly serviceSid: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: Record<string, string>) {
    const res = await this.fetchImpl(`https://verify.twilio.com/v2/Services/${this.serviceSid}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10_000),
    });
    return res;
  }

  async start(phoneE164: string): Promise<VerifyStart> {
    const res = await this.post('Verifications', { To: phoneE164, Channel: 'sms' });
    if (!res.ok) throw new Error(`Verification provider responded ${res.status}`);
    return {};
  }

  async check(phoneE164: string, code: string): Promise<VerifyCheck> {
    const res = await this.post('VerificationCheck', { To: phoneE164, Code: code });
    if (res.status === 404) return 'expired';
    if (!res.ok) throw new Error(`Verification provider responded ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return body.status === 'approved' ? 'ok' : 'wrong';
  }
}

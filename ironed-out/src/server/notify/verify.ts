import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { verificationCodes } from '../db/schema';
import type { Db } from '../db/types';
import { hmac, safeEqual } from '../security/tokens';
import type { SmsSender } from './sms';

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export type VerifyStart = {
  /** Only in SMS demo mode: the code to show on screen instead of texting it. */
  demoCode?: string;
};

export type VerifyCheck = 'ok' | 'wrong' | 'expired';

/** Sends and checks 6-digit phone codes: shown on screen (demo) or texted (sms). */
export interface PhoneVerifier {
  readonly kind: 'demo' | 'sms';
  start(phoneE164: string, purpose: 'claim' | 'phone'): Promise<VerifyStart>;
  check(phoneE164: string, code: string, purpose: 'claim' | 'phone'): Promise<VerifyCheck>;
}

/**
 * Issues codes from our own table and hands them back for on-screen display. Used until a
 * Twilio account is connected. Codes are keyed-hashed, expire in 10 minutes and allow 5 tries.
 */
export class DemoVerifier implements PhoneVerifier {
  readonly kind: 'demo' | 'sms' = 'demo';
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

/**
 * Real texts: the same codes, generated and checked by us, sent as an ordinary message through the
 * SMS provider. Cheaper than a hosted verification product (one message, no per-check fee) and
 * keeps one code path. The last line is the WebOTP/autofill format, so phones can offer the code.
 */
export class SmsCodeVerifier extends DemoVerifier {
  override readonly kind = 'sms';
  constructor(
    db: Db,
    secret: string,
    private readonly sms: SmsSender,
    private readonly appHost: string,
    now: () => Date = () => new Date(),
  ) {
    super(db, secret, now);
  }

  override async start(phoneE164: string, purpose: 'claim' | 'phone'): Promise<VerifyStart> {
    const { demoCode: code } = await super.start(phoneE164, purpose);
    await this.sms.send(
      phoneE164,
      `Ironed Out code: ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Don't share it.\n\n@${this.appHost} #${code}`,
    );
    return {};
  }
}

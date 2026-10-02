import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../audit';
import { passwordResetTokens, players, sessions, users } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db } from '../db/types';
import { DomainError } from '../errors';
import type { Mailer } from '../notify/email';
import type { PhoneVerifier } from '../notify/verify';
import { maskPhone, normalizePhone } from '../phone';
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
  type BreachChecker,
} from '../security/password';
import { hit } from '../security/rate-limit';
import { randomToken, sha256 } from '../security/tokens';
import { parseInput } from '../validation';

export const SESSION_TTL_DAYS = 30;
export const RESET_TTL_MINUTES = 30;

export type AccountsDeps = {
  db: Db;
  tenantId: string;
  mailer: Mailer;
  isBreached: BreachChecker;
  appUrl: string;
  now?: () => Date;
};

/** Who is making the request. Used for rate limits, sessions and the audit log. */
export type RequestContext = { ip: string | null; userAgent: string | null };

export type SessionUser = {
  sessionId: string;
  userId: string;
  playerId: string;
  name: string;
  email: string;
  phoneE164: string | null;
};

const Email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'));
const Password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export const SignUpInput = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(60),
  email: Email,
  password: Password,
});
export const LogInInput = z.object({
  email: Email,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX),
});
export const ResetRequestInput = z.object({ email: Email });
export const ResetInput = z.object({ token: z.string().min(10).max(64), password: Password });

const GENERIC_LOGIN_ERROR = "That email and password don't match.";
const BREACHED_ERROR = 'That password has shown up in a data breach. Pick a different one.';

const ipKey = (ctx: RequestContext) => ctx.ip ?? 'unknown';
const nowOf = (deps: Pick<AccountsDeps, 'now'>) => deps.now?.() ?? new Date();

async function createSession(deps: AccountsDeps, userId: string, ctx: RequestContext) {
  const token = randomToken(32);
  const expiresAt = new Date(nowOf(deps).getTime() + SESSION_TTL_DAYS * 86_400_000);
  await deps.db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    ip: ctx.ip,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export async function signUp(deps: AccountsDeps, input: unknown, ctx: RequestContext) {
  const data = parseInput(SignUpInput, input);
  await hit(deps.db, [{ key: `signup:ip:${ipKey(ctx)}`, max: 10, windowSec: 3600 }], nowOf(deps));
  if (await deps.isBreached(data.password)) {
    throw new DomainError('invalid_input', BREACHED_ERROR, { fields: { password: BREACHED_ERROR } });
  }
  const passwordHash = await hashPassword(data.password);

  const user = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, data.email));
    if (existing) {
      throw new DomainError('conflict', 'An account with that email already exists. Try logging in.', {
        fields: { email: 'An account with that email already exists.' },
      });
    }
    const [u] = await tx
      .insert(users)
      .values({ tenantId: deps.tenantId, email: data.email, name: data.name, passwordHash })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    await tx.insert(players).values({ tenantId: deps.tenantId, userId: u.id, displayName: data.name });
    await audit(tx, { tenantId: deps.tenantId, actor: `user:${u.id}`, action: 'auth.signup', ip: ctx.ip });
    return u;
  });

  return { userId: user.id, session: await createSession(deps, user.id, ctx) };
}

export async function logIn(deps: AccountsDeps, input: unknown, ctx: RequestContext) {
  const data = parseInput(LogInInput, input);
  await hit(
    deps.db,
    [
      { key: `login:ip:${ipKey(ctx)}`, max: 30, windowSec: 900 },
      { key: `login:acct:${sha256(data.email)}`, max: 10, windowSec: 900 },
    ],
    nowOf(deps),
  );

  const user = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.email, data.email));
    return u;
  });
  if (!user) {
    await burnPasswordCheck(data.password);
    throw new DomainError('unauthorized', GENERIC_LOGIN_ERROR);
  }
  const ok = await verifyPassword(user.passwordHash, data.password);
  if (!ok || user.disabledAt) {
    await withTenant(deps.db, deps.tenantId, (tx) =>
      audit(tx, {
        tenantId: deps.tenantId,
        actor: 'anon',
        action: 'auth.login_failed',
        target: `user:${user.id}`,
        ip: ctx.ip,
      }),
    );
    throw new DomainError('unauthorized', GENERIC_LOGIN_ERROR);
  }
  await withTenant(deps.db, deps.tenantId, (tx) =>
    audit(tx, { tenantId: deps.tenantId, actor: `user:${user.id}`, action: 'auth.login', ip: ctx.ip }),
  );
  return { userId: user.id, session: await createSession(deps, user.id, ctx) };
}

export async function getSessionUser(
  deps: Pick<AccountsDeps, 'db' | 'tenantId' | 'now'>,
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token || token.length > 64) return null;
  const now = nowOf(deps);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        sessionId: sessions.id,
        userId: users.id,
        playerId: players.id,
        name: users.name,
        email: users.email,
        phoneE164: users.phoneE164,
        disabledAt: users.disabledAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(players, eq(players.userId, users.id))
      .where(
        and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
      );
    if (!row || row.disabledAt) return null;
    const { disabledAt: _disabled, ...user } = row;
    return user;
  });
}

export async function logOut(deps: AccountsDeps, token: string | undefined, ctx: RequestContext) {
  if (!token) return;
  const [s] = await deps.db
    .update(sessions)
    .set({ revokedAt: nowOf(deps) })
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)))
    .returning({ userId: sessions.userId });
  if (s) {
    await withTenant(deps.db, deps.tenantId, (tx) =>
      audit(tx, { tenantId: deps.tenantId, actor: `user:${s.userId}`, action: 'auth.logout', ip: ctx.ip }),
    );
  }
}

/** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
export async function requestPasswordReset(deps: AccountsDeps, input: unknown, ctx: RequestContext) {
  const data = parseInput(ResetRequestInput, input);
  await hit(
    deps.db,
    [
      { key: `reset:ip:${ipKey(ctx)}`, max: 10, windowSec: 3600 },
      { key: `reset:acct:${sha256(data.email)}`, max: 3, windowSec: 3600 },
    ],
    nowOf(deps),
  );
  const user = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.email, data.email));
    if (!u || u.disabledAt) return null;
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: 'anon',
      action: 'auth.reset_requested',
      target: `user:${u.id}`,
      ip: ctx.ip,
    });
    return u;
  });
  if (!user) return;

  const token = randomToken(32);
  await deps.db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(nowOf(deps).getTime() + RESET_TTL_MINUTES * 60_000),
  });
  const link = `${deps.appUrl}/reset?token=${token}`;
  await deps.mailer.send({
    to: user.email,
    subject: 'Reset your Ironed Out password',
    text: [
      `Hi ${user.name},`,
      '',
      `Tap this link to pick a new password. It works once and expires in ${RESET_TTL_MINUTES} minutes:`,
      '',
      link,
      '',
      "If you didn't ask for this, you can ignore this email.",
    ].join('\n'),
  });
}

export async function resetPassword(deps: AccountsDeps, input: unknown, ctx: RequestContext) {
  const data = parseInput(ResetInput, input);
  await hit(deps.db, [{ key: `reset-use:ip:${ipKey(ctx)}`, max: 20, windowSec: 3600 }], nowOf(deps));
  const now = nowOf(deps);
  const tokenHash = sha256(data.token);

  const [valid] = await deps.db
    .select({ userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    );
  if (!valid) {
    throw new DomainError('gone', 'That reset link has expired or was already used. Ask for a new one.');
  }
  if (await deps.isBreached(data.password)) {
    throw new DomainError('invalid_input', BREACHED_ERROR, { fields: { password: BREACHED_ERROR } });
  }
  const passwordHash = await hashPassword(data.password);

  const userId = await withTenant(deps.db, deps.tenantId, async (tx) => {
    // Claim the token inside the transaction so two concurrent submits can't both use it.
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .returning({ userId: passwordResetTokens.userId });
    if (!claimed) {
      throw new DomainError('gone', 'That reset link has expired or was already used. Ask for a new one.');
    }
    await tx.update(users).set({ passwordHash }).where(eq(users.id, claimed.userId));
    // Signing out everywhere else is the point of a reset.
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, claimed.userId), isNull(sessions.revokedAt)));
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${claimed.userId}`,
      action: 'auth.reset_completed',
      ip: ctx.ip,
    });
    return claimed.userId;
  });
  return { userId, session: await createSession(deps, userId, ctx) };
}

// ---------------------------------------------------------------------------------------------
// Phone for alerts (Alerts screen): verify a number for an account holder.
// ---------------------------------------------------------------------------------------------

export type PhoneDeps = { db: Db; tenantId: string; verifier: PhoneVerifier; now?: () => Date };

const PhoneOnly = z.object({
  phone: z
    .string()
    .trim()
    .transform((v, c) => {
      const e164 = normalizePhone(v);
      if (!e164) {
        c.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile number.' });
        return z.NEVER;
      }
      return e164;
    }),
});
const PhoneAndCode = PhoneOnly.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export async function startPhoneVerification(
  deps: PhoneDeps,
  userId: string,
  input: unknown,
  ctx: RequestContext,
) {
  const { phone } = parseInput(PhoneOnly, input);
  await hit(
    deps.db,
    [
      { key: `code:phone:${sha256(phone)}`, max: 5, windowSec: 3600 },
      { key: `code:user:${userId}`, max: 10, windowSec: 3600 },
      { key: `code:ip:${ipKey(ctx)}`, max: 20, windowSec: 3600 },
    ],
    nowOf(deps),
  );
  const r = await deps.verifier.start(phone, 'phone');
  return { phoneMasked: maskPhone(phone), demoCode: r.demoCode };
}

export async function confirmPhoneVerification(
  deps: PhoneDeps,
  userId: string,
  input: unknown,
  ctx: RequestContext,
) {
  const { phone, code } = parseInput(PhoneAndCode, input);
  await hit(deps.db, [{ key: `code-check:ip:${ipKey(ctx)}`, max: 30, windowSec: 3600 }], nowOf(deps));
  const result = await deps.verifier.check(phone, code, 'phone');
  if (result !== 'ok') {
    const message = result === 'wrong' ? "That code didn't match." : 'That code expired. Send a new one.';
    throw new DomainError(result === 'wrong' ? 'invalid_input' : 'gone', message, {
      fields: { code: message },
    });
  }
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await tx
      .update(users)
      .set({ phoneE164: phone, phoneVerifiedAt: nowOf(deps) })
      .where(eq(users.id, userId));
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${userId}`,
      action: 'auth.phone_verified',
      ip: ctx.ip,
    });
  });
}

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { auditLog, players, rateLimits, users } from '../db/schema';
import { withTenant } from '../db/tenant';
import { OutboxMailer } from '../notify/email';
import {
  getSessionUser,
  logIn,
  logOut,
  requestPasswordReset,
  resetPassword,
  signUp,
  type AccountsDeps,
} from './accounts';

let t: TestDb;
let deps: AccountsDeps;
let mailer: OutboxMailer;
const ctx = { ip: '203.0.113.7', userAgent: 'vitest' };
const breached = new Set(['password123']);

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.pg.close();
});
beforeEach(async () => {
  mailer = new OutboxMailer();
  deps = {
    db: t.db,
    tenantId: t.tenantId,
    mailer,
    isBreached: async (pw) => breached.has(pw),
    appUrl: 'https://ironed.test',
  };
  await t.db.delete(rateLimits);
});

const resetTokenFrom = (m: OutboxMailer) => /token=([A-Za-z0-9]+)/.exec(m.messages[0]?.text ?? '')?.[1];

describe('sign up', () => {
  it('creates a user, their player, a session and an audit entry', async () => {
    const { userId, session } = await signUp(
      deps,
      { name: 'Mike', email: ' Mike@Example.com ', password: 'fairway-7-iron' },
      ctx,
    );
    const me = await getSessionUser(deps, session.token);
    expect(me).toMatchObject({ userId, name: 'Mike', email: 'mike@example.com' });

    await withTenant(t.db, t.tenantId, async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      expect(u?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(await tx.select().from(players).where(eq(players.userId, userId))).toHaveLength(1);
      const actions = (await tx.select().from(auditLog)).map((a) => a.action);
      expect(actions).toContain('auth.signup');
    });
  });

  it('rejects a duplicate email regardless of case', async () => {
    await expect(
      signUp(deps, { name: 'M', email: 'MIKE@example.com', password: 'another-pass-1' }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects short and breached passwords with field errors', async () => {
    await expect(
      signUp(deps, { name: 'Jen', email: 'jen@example.com', password: 'short' }, ctx),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      details: { fields: { password: 'Use at least 8 characters.' } },
    });
    await expect(
      signUp(deps, { name: 'Jen', email: 'jen@example.com', password: 'password123' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('breach') });
  });
});

describe('log in / log out', () => {
  it('logs in with the right password and rotates to a new session', async () => {
    const a = await logIn(deps, { email: 'mike@example.com', password: 'fairway-7-iron' }, ctx);
    const b = await logIn(deps, { email: 'mike@example.com', password: 'fairway-7-iron' }, ctx);
    expect(a.session.token).not.toBe(b.session.token);
    expect(await getSessionUser(deps, b.session.token)).not.toBeNull();
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const wrong = logIn(deps, { email: 'mike@example.com', password: 'nope-nope-nope' }, ctx);
    const unknown = logIn(deps, { email: 'ghost@example.com', password: 'nope-nope-nope' }, ctx);
    await expect(wrong).rejects.toMatchObject({
      code: 'unauthorized',
      message: "That email and password don't match.",
    });
    await expect(unknown).rejects.toMatchObject({
      code: 'unauthorized',
      message: "That email and password don't match.",
    });
  });

  it('rate limits repeated failures on one account', async () => {
    for (let i = 0; i < 10; i++) {
      await logIn(deps, { email: 'mike@example.com', password: 'wrong-wrong' }, ctx).catch(() => undefined);
    }
    await expect(
      logIn(deps, { email: 'mike@example.com', password: 'fairway-7-iron' }, ctx),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('log out revokes the session', async () => {
    const { session } = await logIn(deps, { email: 'mike@example.com', password: 'fairway-7-iron' }, ctx);
    await logOut(deps, session.token, ctx);
    expect(await getSessionUser(deps, session.token)).toBeNull();
  });

  it('ignores garbage and expired session tokens', async () => {
    expect(await getSessionUser(deps, 'not-a-token')).toBeNull();
    const { session } = await logIn(deps, { email: 'mike@example.com', password: 'fairway-7-iron' }, ctx);
    const later = { ...deps, now: () => new Date(Date.now() + 31 * 86_400_000) };
    expect(await getSessionUser(later, session.token)).toBeNull();
  });
});

describe('password reset', () => {
  it('says nothing about unknown emails', async () => {
    await requestPasswordReset(deps, { email: 'ghost@example.com' }, ctx);
    expect(mailer.messages).toHaveLength(0);
  });

  it('emails a single-use link that resets the password and signs out other sessions', async () => {
    const old = await logIn(deps, { email: 'mike@example.com', password: 'fairway-7-iron' }, ctx);
    await requestPasswordReset(deps, { email: 'mike@example.com' }, ctx);
    const token = resetTokenFrom(mailer);
    expect(mailer.messages[0]?.text).toContain('https://ironed.test/reset?token=');
    expect(token).toBeDefined();

    const { session } = await resetPassword(deps, { token, password: 'new-sand-wedge-9' }, ctx);
    expect(await getSessionUser(deps, old.session.token)).toBeNull();
    expect(await getSessionUser(deps, session.token)).not.toBeNull();
    await expect(resetPassword(deps, { token, password: 'another-one-22' }, ctx)).rejects.toMatchObject({
      code: 'gone',
    });
    await expect(
      logIn(deps, { email: 'mike@example.com', password: 'new-sand-wedge-9' }, ctx),
    ).resolves.toBeDefined();
  });

  it('expires links after 30 minutes', async () => {
    await requestPasswordReset(deps, { email: 'mike@example.com' }, ctx);
    const token = resetTokenFrom(mailer);
    const later = { ...deps, now: () => new Date(Date.now() + 31 * 60_000) };
    await expect(resetPassword(later, { token, password: 'new-sand-wedge-10' }, ctx)).rejects.toMatchObject({
      code: 'gone',
    });
  });

  it('keeps the link usable when the new password is breached', async () => {
    await requestPasswordReset(deps, { email: 'mike@example.com' }, ctx);
    const token = resetTokenFrom(mailer);
    await expect(resetPassword(deps, { token, password: 'password123' }, ctx)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(resetPassword(deps, { token, password: 'fresh-driver-11' }, ctx)).resolves.toBeDefined();
  });
});

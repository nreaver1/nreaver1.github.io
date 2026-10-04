import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import {
  crewInvites,
  idempotencyKeys,
  notifications,
  outings,
  passwordResetTokens,
  players,
  sessions,
  tenants,
  users,
  verificationCodes,
  webhookDeliveries,
} from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { pruneRateLimits } from '../security/rate-limit';
import { IDEMPOTENCY_TTL_MS } from './idempotency';

/**
 * Data retention (SPEC §6). Runs with the scheduled dispatcher; every step is idempotent and cheap
 * when there's nothing to do.
 */

const DAY = 86_400_000;
export const RETENTION = {
  verificationCodesMs: DAY,
  rateLimitWindowsMs: 2 * DAY,
  sessionsAfterEndMs: 30 * DAY,
  resetTokensMs: DAY,
  webhookDeliveriesMs: 30 * DAY,
  notificationsMs: 90 * DAY,
};

const monthsBefore = (now: Date, months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

export type RetentionTotals = Record<
  | 'verificationCodes'
  | 'sessions'
  | 'resetTokens'
  | 'idempotencyKeys'
  | 'webhookDeliveries'
  | 'notifications'
  | 'outings'
  | 'players'
  | 'phonesEncrypted',
  number
>;

export async function runRetention(db: Db, now = new Date()): Promise<RetentionTotals> {
  const totals: RetentionTotals = {
    verificationCodes: 0,
    sessions: 0,
    resetTokens: 0,
    idempotencyKeys: 0,
    webhookDeliveries: 0,
    notifications: 0,
    outings: 0,
    players: 0,
    phonesEncrypted: await encryptLegacyPhones(db),
  };
  const ago = (ms: number) => new Date(now.getTime() - ms);

  // Not tenant-scoped.
  totals.verificationCodes = (
    await db
      .delete(verificationCodes)
      .where(lt(verificationCodes.createdAt, ago(RETENTION.verificationCodesMs)))
      .returning({ id: verificationCodes.id })
  ).length;
  await pruneRateLimits(db, ago(RETENTION.rateLimitWindowsMs));
  totals.sessions = (
    await db
      .delete(sessions)
      .where(
        or(
          lt(sessions.expiresAt, ago(RETENTION.sessionsAfterEndMs)),
          lt(sessions.revokedAt, ago(RETENTION.sessionsAfterEndMs)),
        ),
      )
      .returning({ id: sessions.id })
  ).length;
  totals.resetTokens = (
    await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, ago(RETENTION.resetTokensMs)))
      .returning({ id: passwordResetTokens.id })
  ).length;

  const tenantRows = await db.select({ id: tenants.id, months: tenants.retentionMonths }).from(tenants);
  for (const t of tenantRows) {
    await withTenant(db, t.id, async (tx) => {
      totals.idempotencyKeys += (
        await tx
          .delete(idempotencyKeys)
          .where(lt(idempotencyKeys.createdAt, ago(IDEMPOTENCY_TTL_MS)))
          .returning({ key: idempotencyKeys.key })
      ).length;
      totals.webhookDeliveries += (
        await tx
          .delete(webhookDeliveries)
          .where(
            and(
              inArray(webhookDeliveries.status, ['delivered', 'failed']),
              lt(webhookDeliveries.createdAt, ago(RETENTION.webhookDeliveriesMs)),
            ),
          )
          .returning({ id: webhookDeliveries.id })
      ).length;
      totals.notifications += (
        await tx
          .delete(notifications)
          .where(
            and(
              inArray(notifications.status, ['sent', 'skipped', 'failed']),
              lt(notifications.createdAt, ago(RETENTION.notificationsMs)),
            ),
          )
          .returning({ id: notifications.id })
      ).length;
      // Outings (and with them tee times, slots, events, views and links) after the tenant's window.
      totals.outings += (
        await tx
          .delete(outings)
          .where(lt(outings.playDate, monthsBefore(now, t.months)))
          .returning({ id: outings.id })
      ).length;
      totals.players += await purgeOrphanPlayers(tx, ago(t.months * 30 * DAY));
    });
  }
  return totals;
}

/**
 * Phone-only players (no account) who no longer appear anywhere: their name and number are the
 * only thing left, so they go once they're older than the retention window.
 */
async function purgeOrphanPlayers(tx: Tx, createdBefore: Date): Promise<number> {
  const rows = await tx
    .delete(players)
    .where(
      and(
        isNull(players.userId),
        lt(players.createdAt, createdBefore),
        sql`not exists (select 1 from slots s where s.player_id = ${players.id} or s.guest_of_player_id = ${players.id})`,
        sql`not exists (select 1 from outings o where o.organizer_player_id = ${players.id})`,
        sql`not exists (select 1 from outing_events e where e.actor_player_id = ${players.id})`,
        sql`not exists (select 1 from invite_links l where l.created_by = ${players.id})`,
      ),
    )
    .returning({ id: players.id });
  return rows.length;
}

/**
 * Seals phone numbers stored before encryption at rest (plain "+…" values). Raw SQL sees the
 * stored text, so this finds them; writing back through Drizzle encrypts. Idempotent.
 */
export async function encryptLegacyPhones(db: Db): Promise<number> {
  let n = 0;
  const plain = (col: unknown) => sql`${col} like '+%'`;
  const codes = await db
    .select({ id: verificationCodes.id, phone: verificationCodes.phoneE164 })
    .from(verificationCodes)
    .where(plain(verificationCodes.phoneE164));
  for (const c of codes) {
    await db.update(verificationCodes).set({ phoneE164: c.phone }).where(eq(verificationCodes.id, c.id));
    n++;
  }
  const tenantRows = await db.select({ id: tenants.id }).from(tenants);
  for (const { id } of tenantRows) {
    n += await withTenant(db, id, async (tx) => {
      let count = 0;
      const ps = await tx
        .select({ id: players.id, phone: players.phoneE164 })
        .from(players)
        .where(and(isNotNull(players.phoneE164), plain(players.phoneE164)));
      for (const p of ps) {
        // A sealed duplicate may already exist (created while old code was still serving): keep it.
        const dup = await tx.select({ id: players.id }).from(players).where(eq(players.phoneE164, p.phone!));
        await tx
          .update(players)
          .set({ phoneE164: dup.length ? null : p.phone })
          .where(eq(players.id, p.id));
        count++;
      }
      const us = await tx
        .select({ id: users.id, phone: users.phoneE164 })
        .from(users)
        .where(and(isNotNull(users.phoneE164), plain(users.phoneE164)));
      for (const u of us) {
        await tx.update(users).set({ phoneE164: u.phone }).where(eq(users.id, u.id));
        count++;
      }
      const invites = await tx
        .select({ id: crewInvites.id, phone: crewInvites.inviteePhone })
        .from(crewInvites)
        .where(and(isNotNull(crewInvites.inviteePhone), plain(crewInvites.inviteePhone)));
      for (const i of invites) {
        await tx.update(crewInvites).set({ inviteePhone: i.phone }).where(eq(crewInvites.id, i.id));
        count++;
      }
      return count;
    });
  }
  return n;
}

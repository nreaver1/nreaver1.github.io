import { and, asc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../audit';
import {
  courses,
  crewInvites,
  crewMembers,
  crews,
  notificationPrefs,
  notifications,
  notificationSettings,
  outings,
  players,
  slots,
  teeTimes,
  users,
} from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db } from '../db/types';
import { DomainError } from '../errors';
import { verifyPassword } from '../security/password';
import { hit } from '../security/rate-limit';
import { parseInput } from '../validation';
import type { RequestContext } from './accounts';
import { clearSlots, lockOuting, recordEvent } from './outings';

/** Self-serve export and deletion of an account (SPEC §6). */
export type AccountDataDeps = { db: Db; tenantId: string; now?: () => Date };

export const FORMER_MEMBER_NAME = 'Former member';

/** Everything we hold about an account holder, as plain JSON. */
export async function exportAccount(deps: AccountDataDeps, userId: string) {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) throw new DomainError('not_found', 'No such account.');
    const [player] = await tx.select().from(players).where(eq(players.userId, userId));
    const playerId = player?.id ?? '00000000-0000-0000-0000-000000000000';

    const spots = await tx
      .select({
        outingId: outings.id,
        course: courses.name,
        playDate: outings.playDate,
        startsAt: teeTimes.startsAt,
        guest: slots.guestOfPlayerId,
        organizer: outings.organizerPlayerId,
      })
      .from(slots)
      .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
      .innerJoin(outings, eq(outings.id, slots.outingId))
      .innerJoin(courses, eq(courses.id, outings.courseId))
      .where(or(eq(slots.playerId, playerId), eq(slots.guestOfPlayerId, playerId)))
      .orderBy(asc(teeTimes.startsAt));
    const organized = await tx
      .select({ id: outings.id, course: courses.name, playDate: outings.playDate, note: outings.note })
      .from(outings)
      .innerJoin(courses, eq(courses.id, outings.courseId))
      .where(eq(outings.organizerPlayerId, playerId))
      .orderBy(asc(outings.playDate));
    const memberships = await tx
      .select({ crew: crews.name, role: crewMembers.role, joinedAt: crewMembers.createdAt })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(eq(crewMembers.userId, userId));
    const prefs = await tx.select().from(notificationPrefs).where(eq(notificationPrefs.playerId, playerId));
    const [settings] = await tx
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.playerId, playerId));
    const messages = await tx
      .select({
        channel: notifications.channel,
        kind: notifications.kind,
        status: notifications.status,
        body: notifications.body,
        sentAt: notifications.sentAt,
      })
      .from(notifications)
      .where(eq(notifications.playerId, playerId))
      .orderBy(asc(notifications.createdAt));

    return {
      exported_at: (deps.now?.() ?? new Date()).toISOString(),
      account: {
        name: user.name,
        email: user.email,
        phone: user.phoneE164,
        phone_verified_at: user.phoneVerifiedAt,
        created_at: user.createdAt,
      },
      outings_organized: organized.map((o) => ({
        id: o.id,
        course: o.course,
        play_date: o.playDate,
        note: o.note,
      })),
      spots: spots.map((s) => ({
        outing_id: s.outingId,
        course: s.course,
        play_date: s.playDate,
        tee_time: s.startsAt,
        as: s.guest ? 'guest you brought' : s.organizer === playerId ? 'organizer' : 'player',
      })),
      crews: memberships.map((m) => ({ name: m.crew, role: m.role, joined_at: m.joinedAt })),
      alert_preferences: prefs.map((p) => ({ type: p.eventType, text: p.sms, email: p.email })),
      quiet_hours: settings
        ? { start: settings.quietStart, end: settings.quietEnd, texts_stopped_at: settings.smsOptedOutAt }
        : 'default (10 PM to 7 AM)',
      messages_sent_to_you: messages.map((m) => ({ ...m, sent_at: m.sentAt })),
    };
  });
}

export const DeleteAccountInput = z.object({
  password: z.string().min(1, 'Enter your password to confirm.').max(200),
});

/**
 * Deletes an account. Upcoming outings they organize are deleted; spots they hold in other
 * upcoming outings are freed (players there see "X dropped out"); crews they own are deleted.
 * Past tee sheets keep a nameless "Former member" so other people's history still adds up, and
 * retention purges those outings later.
 */
export async function deleteAccount(
  deps: AccountDataDeps,
  userId: string,
  input: unknown,
  ctx: RequestContext,
) {
  const { password } = parseInput(DeleteAccountInput, input);
  const now = deps.now?.() ?? new Date();
  await hit(deps.db, [{ key: `delete-account:${userId}`, max: 5, windowSec: 900 }], now);
  const [user] = await withTenant(deps.db, deps.tenantId, (tx) =>
    tx.select().from(users).where(eq(users.id, userId)),
  );
  if (!user) throw new DomainError('not_found', 'No such account.');
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new DomainError('invalid_input', 'That password isn’t right.', {
      fields: { password: 'That password isn’t right.' },
    });
  }

  // A day of slack so "upcoming" covers today in every US zone.
  const since = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const [player] = await tx.select().from(players).where(eq(players.userId, userId));
    if (player) {
      await tx
        .delete(outings)
        .where(and(eq(outings.organizerPlayerId, player.id), gte(outings.playDate, since)));

      const held = await tx
        .select({ outingId: slots.outingId, slotId: slots.id, startsAt: teeTimes.startsAt })
        .from(slots)
        .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
        .innerJoin(outings, eq(outings.id, slots.outingId))
        .where(
          and(eq(slots.playerId, player.id), isNull(slots.guestOfPlayerId), gte(outings.playDate, since)),
        );
      for (const h of held) {
        await lockOuting(tx, h.outingId);
        const guests = await tx
          .select({ id: slots.id })
          .from(slots)
          .where(and(eq(slots.outingId, h.outingId), eq(slots.guestOfPlayerId, player.id)));
        const ids = [h.slotId, ...guests.map((g) => g.id)];
        await clearSlots(tx, ids);
        await recordEvent(tx, h.outingId, 'slot_released', player.id, {
          playerName: player.displayName,
          startsAt: h.startsAt.toISOString(),
          guestCount: guests.length,
          slotIds: ids,
        });
      }

      await tx.delete(notifications).where(eq(notifications.playerId, player.id));
      await tx.delete(notificationPrefs).where(eq(notificationPrefs.playerId, player.id));
      await tx.delete(notificationSettings).where(eq(notificationSettings.playerId, player.id));
      await tx
        .update(players)
        .set({ displayName: FORMER_MEMBER_NAME, phoneE164: null, phoneVerifiedAt: null, userId: null })
        .where(eq(players.id, player.id));
    }

    const owned = await tx.select({ id: crews.id }).from(crews).where(eq(crews.ownerUserId, userId));
    if (owned.length) {
      await tx.delete(crews).where(
        inArray(
          crews.id,
          owned.map((c) => c.id),
        ),
      );
    }
    await tx.update(crewInvites).set({ createdBy: null }).where(eq(crewInvites.createdBy, userId));
    await tx.delete(users).where(eq(users.id, userId));
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${userId}`,
      action: 'account.deleted',
      ip: ctx.ip,
      meta: { crewsDeleted: owned.length },
    });
  });
}

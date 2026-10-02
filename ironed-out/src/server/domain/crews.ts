import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { audit } from '../audit';
import { crewInvites, crewMembers, crews, notificationSettings, players, users } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import type { Mailer } from '../notify/email';
import type { SmsSender } from '../notify/sms';
import { maskPhone, normalizePhone } from '../phone';
import { hit } from '../security/rate-limit';
import { derivedToken, sha256 } from '../security/tokens';
import { parseInput } from '../validation';

export type CrewDeps = { db: Db; tenantId: string; secret: string; now?: () => Date };

export const MAX_CREWS_PER_USER = 20;
export const PERSONAL_INVITE_DAYS = 30;

const CrewName = z.object({
  name: z.string().trim().min(1, 'Give your crew a name.').max(40, 'Keep it under 40 characters.'),
});

/** "Jen Putts" + "jen@example.com" or "(410) 555-0199". */
export const PersonalInviteInput = z.object({
  name: z.string().trim().min(1, 'Who are you inviting?').max(40, 'Keep the name under 40 characters.'),
  contact: z
    .string()
    .trim()
    .max(254)
    .transform((v, ctx) => {
      if (v.includes('@')) {
        const email = z.email().safeParse(v.toLowerCase());
        if (email.success) return { email: email.data, phone: null };
      } else {
        const phone = normalizePhone(v);
        if (phone) return { email: null, phone };
      }
      ctx.addIssue({ code: 'custom', message: 'Enter a mobile number or an email address.' });
      return z.NEVER;
    }),
});

const tokenFor = (secret: string, inviteId: string) => derivedToken(secret, `crew:${inviteId}`);
const nowOf = (deps: Pick<CrewDeps, 'now'>) => deps.now?.() ?? new Date();

export type CrewSummary = {
  id: string;
  name: string;
  memberCount: number;
  pendingCount: number;
  isOwner: boolean;
};

export type CrewMemberView = {
  userId: string;
  name: string;
  role: 'owner' | 'member';
  status: 'active' | 'pending';
  isYou: boolean;
};

/** Someone invited by name who hasn't joined yet (shown dashed, "· invited"). */
export type CrewInvitedView = {
  inviteId: string;
  name: string;
  /** "jen@example.com" or "•••-•••-0199"; only shown to the owner. */
  contact: string | null;
  /** Their personal join link token (owner only, so it can be copied and sent by hand). */
  token: string | null;
};

export type CrewView = {
  id: string;
  name: string;
  isOwner: boolean;
  members: CrewMemberView[];
  invited: CrewInvitedView[];
  inviteToken: string;
};

const openInvite = (now: Date) =>
  and(
    eq(crewInvites.status, 'open'),
    isNull(crewInvites.revokedAt),
    or(isNull(crewInvites.expiresAt), gt(crewInvites.expiresAt, now)),
  );

async function membership(tx: Tx, crewId: string, userId: string) {
  if (!z.uuid().safeParse(crewId).success) return null;
  const [m] = await tx
    .select({ role: crewMembers.role, status: crewMembers.status, crewName: crews.name })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)));
  return m ?? null;
}

async function requireOwner(tx: Tx, crewId: string, userId: string) {
  const m = await membership(tx, crewId, userId);
  if (!m) throw new DomainError('not_found', 'That crew doesn’t exist.');
  if (m.role !== 'owner') throw new DomainError('forbidden', 'Only the crew’s owner can do that.');
  return m;
}

/** The crew's shareable link token, creating the link the first time. */
async function ensureInvite(tx: Tx, deps: CrewDeps, crewId: string, userId: string) {
  const [active] = await tx
    .select({ id: crewInvites.id })
    .from(crewInvites)
    .where(and(eq(crewInvites.crewId, crewId), eq(crewInvites.kind, 'link'), openInvite(nowOf(deps))))
    .orderBy(desc(crewInvites.createdAt))
    .limit(1);
  if (active) return tokenFor(deps.secret, active.id);
  const id = uuidv7();
  const token = tokenFor(deps.secret, id);
  await tx
    .insert(crewInvites)
    .values({ id, crewId, kind: 'link', tokenHash: sha256(token), createdBy: userId });
  return token;
}

/** The account's email and verified phone, for matching personal invites. */
async function contactOf(tx: Tx, userId: string) {
  const [u] = await tx
    .select({ email: users.email, phone: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  return { email: u?.email ?? null, phone: u?.phoneVerifiedAt ? u.phone : null };
}

const matchesContact = (c: { email: string | null; phone: string | null }) =>
  or(
    c.email ? eq(crewInvites.inviteeEmail, c.email) : sql`false`,
    c.phone ? eq(crewInvites.inviteePhone, c.phone) : sql`false`,
  );

async function addMember(tx: Tx, deps: CrewDeps, crewId: string, userId: string) {
  await tx
    .insert(crewMembers)
    .values({ crewId, userId, role: 'member', status: 'active' })
    .onConflictDoUpdate({
      target: [crewMembers.crewId, crewMembers.userId],
      set: { status: 'active', updatedAt: new Date() },
    });
  // Any personal invites to this person for this crew are now settled.
  const contact = await contactOf(tx, userId);
  await tx
    .update(crewInvites)
    .set({ status: 'accepted', acceptedBy: userId })
    .where(
      and(
        eq(crewInvites.crewId, crewId),
        eq(crewInvites.kind, 'personal'),
        eq(crewInvites.status, 'open'),
        matchesContact(contact),
      ),
    );
  await audit(tx, {
    tenantId: deps.tenantId,
    actor: `user:${userId}`,
    action: 'crew.joined',
    target: `crew:${crewId}`,
  });
}

export async function createCrew(deps: CrewDeps, userId: string, input: unknown): Promise<string> {
  const { name } = parseInput(CrewName, input);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [owned] = await tx.select({ n: count() }).from(crewMembers).where(eq(crewMembers.userId, userId));
    if ((owned?.n ?? 0) >= MAX_CREWS_PER_USER) {
      throw new DomainError('conflict', `You can be in up to ${MAX_CREWS_PER_USER} crews.`);
    }
    const [crew] = await tx
      .insert(crews)
      .values({ tenantId: deps.tenantId, name, ownerUserId: userId })
      .returning({ id: crews.id });
    await tx.insert(crewMembers).values({ crewId: crew!.id, userId, role: 'owner', status: 'active' });
    await ensureInvite(tx, deps, crew!.id, userId);
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${userId}`,
      action: 'crew.created',
      target: `crew:${crew!.id}`,
    });
    return crew!.id;
  });
}

export async function listCrews(deps: CrewDeps, userId: string): Promise<CrewSummary[]> {
  const now = nowOf(deps);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const mine = await tx
      .select({ id: crews.id, name: crews.name, role: crewMembers.role })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(and(eq(crewMembers.userId, userId), eq(crewMembers.status, 'active')))
      .orderBy(asc(crews.name));
    const out: CrewSummary[] = [];
    for (const c of mine) {
      const [members] = await tx
        .select({ n: count() })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, c.id), eq(crewMembers.status, 'active')));
      const [pending] = await tx
        .select({ n: count() })
        .from(crewInvites)
        .where(and(eq(crewInvites.crewId, c.id), eq(crewInvites.kind, 'personal'), openInvite(now)));
      out.push({
        id: c.id,
        name: c.name,
        memberCount: members?.n ?? 0,
        pendingCount: pending?.n ?? 0,
        isOwner: c.role === 'owner',
      });
    }
    return out;
  });
}

/** A crew as one of its members sees it, or null for everyone else. */
export async function getCrew(deps: CrewDeps, userId: string, crewId: string): Promise<CrewView | null> {
  const now = nowOf(deps);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const me = await membership(tx, crewId, userId);
    if (!me || me.status !== 'active') return null;
    const isOwner = me.role === 'owner';
    const rows = await tx
      .select({ userId: users.id, name: users.name, role: crewMembers.role, status: crewMembers.status })
      .from(crewMembers)
      .innerJoin(users, eq(users.id, crewMembers.userId))
      .where(eq(crewMembers.crewId, crewId))
      .orderBy(sql`${crewMembers.role} = 'owner' desc`, asc(crewMembers.createdAt));
    const invited = await tx
      .select()
      .from(crewInvites)
      .where(and(eq(crewInvites.crewId, crewId), eq(crewInvites.kind, 'personal'), openInvite(now)))
      .orderBy(asc(crewInvites.createdAt));
    return {
      id: crewId,
      name: me.crewName,
      isOwner,
      members: rows.map((r) => ({ ...r, isYou: r.userId === userId })),
      invited: invited.map((i) => ({
        inviteId: i.id,
        name: i.inviteeName ?? 'Someone',
        contact: isOwner ? (i.inviteeEmail ?? (i.inviteePhone ? maskPhone(i.inviteePhone) : null)) : null,
        token: isOwner ? tokenFor(deps.secret, i.id) : null,
      })),
      inviteToken: await ensureInvite(tx, deps, crewId, userId),
    };
  });
}

export async function rotateCrewInvite(deps: CrewDeps, userId: string, crewId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await requireOwner(tx, crewId, userId);
    await tx
      .update(crewInvites)
      .set({ revokedAt: nowOf(deps) })
      .where(
        and(eq(crewInvites.crewId, crewId), eq(crewInvites.kind, 'link'), isNull(crewInvites.revokedAt)),
      );
    await ensureInvite(tx, deps, crewId, userId);
  });
}

// ---------------------------------------------------------------------------------------------
// Personal invites
// ---------------------------------------------------------------------------------------------

export type CreatedInvite = {
  inviteId: string;
  token: string;
  crewName: string;
  fromName: string;
  inviteeName: string;
  email: string | null;
  phone: string | null;
};

/** Invite one person by name + phone or email. Owner only. */
export async function inviteToCrew(
  deps: CrewDeps,
  userId: string,
  crewId: string,
  input: unknown,
): Promise<CreatedInvite> {
  const { name, contact } = parseInput(PersonalInviteInput, input);
  const now = nowOf(deps);
  await hit(deps.db, [{ key: `crew-invite:user:${userId}`, max: 30, windowSec: 3600 }], now);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const me = await requireOwner(tx, crewId, userId);

    // Already in the crew?
    const [already] = await tx
      .select({ id: users.id })
      .from(crewMembers)
      .innerJoin(users, eq(users.id, crewMembers.userId))
      .where(
        and(
          eq(crewMembers.crewId, crewId),
          eq(crewMembers.status, 'active'),
          contact.email
            ? eq(users.email, contact.email)
            : and(eq(users.phoneE164, contact.phone!), sql`${users.phoneVerifiedAt} is not null`),
        ),
      );
    if (already) {
      throw new DomainError('conflict', `${name.split(' ')[0]} is already in the crew.`, {
        fields: { contact: 'They’re already in the crew.' },
      });
    }

    // Re-inviting the same contact refreshes the existing invite instead of stacking them up.
    const [existing] = await tx
      .select()
      .from(crewInvites)
      .where(
        and(
          eq(crewInvites.crewId, crewId),
          eq(crewInvites.kind, 'personal'),
          openInvite(now),
          contact.email
            ? eq(crewInvites.inviteeEmail, contact.email)
            : eq(crewInvites.inviteePhone, contact.phone!),
        ),
      );
    const id = existing?.id ?? uuidv7();
    const token = tokenFor(deps.secret, id);
    const expiresAt = new Date(now.getTime() + PERSONAL_INVITE_DAYS * 86_400_000);
    if (existing) {
      await tx.update(crewInvites).set({ inviteeName: name, expiresAt }).where(eq(crewInvites.id, id));
    } else {
      await tx.insert(crewInvites).values({
        id,
        crewId,
        kind: 'personal',
        tokenHash: sha256(token),
        inviteeName: name,
        inviteeEmail: contact.email,
        inviteePhone: contact.phone,
        expiresAt,
        createdBy: userId,
      });
    }
    const [from] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${userId}`,
      action: 'crew.invite_sent',
      target: `crew:${crewId}`,
      meta: { channel: contact.email ? 'email' : 'sms' },
    });
    return {
      inviteId: id,
      token,
      crewName: me.crewName,
      fromName: from?.name ?? 'Someone',
      inviteeName: name,
      email: contact.email,
      phone: contact.phone,
    };
  });
}

/** Sends a personal invite by text (unless that number replied STOP) or email. */
export async function deliverCrewInvite(
  deps: { db: Db; tenantId: string; sms: SmsSender; mailer: Mailer; appUrl: string },
  invite: CreatedInvite,
): Promise<'sms' | 'email' | 'skipped'> {
  const link = `${deps.appUrl}/g/${invite.token}`;
  const from = invite.fromName.split(' ')[0];
  if (invite.phone) {
    const optedOut = await withTenant(deps.db, deps.tenantId, async (tx) => {
      const rows = await tx
        .select({ at: notificationSettings.smsOptedOutAt })
        .from(players)
        .innerJoin(notificationSettings, eq(notificationSettings.playerId, players.id))
        .where(eq(players.phoneE164, invite.phone!));
      return rows.some((r) => !!r.at);
    });
    if (optedOut) return 'skipped';
    await deps.sms.send(
      invite.phone,
      `Ironed Out: ${from} invited you to ${invite.crewName}, their golf crew. Join to hear about tee times: ${link} Reply STOP to opt out.`,
    );
    return 'sms';
  }
  await deps.mailer.send({
    to: invite.email!,
    subject: `${from} invited you to ${invite.crewName} on Ironed Out`,
    text: [
      `Hi ${invite.inviteeName.split(' ')[0]},`,
      '',
      `${invite.fromName} invited you to ${invite.crewName}, their golf crew on Ironed Out. Join and you'll hear about new tee times as soon as they're posted:`,
      '',
      link,
      '',
      `This invite works for ${PERSONAL_INVITE_DAYS} days.`,
    ].join('\n'),
  });
  return 'email';
}

export async function cancelCrewInvite(deps: CrewDeps, userId: string, inviteId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    if (!z.uuid().safeParse(inviteId).success) throw new DomainError('not_found', 'That invite is gone.');
    const [inv] = await tx.select().from(crewInvites).where(eq(crewInvites.id, inviteId));
    if (!inv || inv.kind !== 'personal') throw new DomainError('not_found', 'That invite is gone.');
    await requireOwner(tx, inv.crewId, userId);
    await tx
      .update(crewInvites)
      .set({ status: 'canceled', revokedAt: nowOf(deps) })
      .where(eq(crewInvites.id, inviteId));
  });
}

export type InviteForYou = { inviteId: string; crewId: string; crewName: string; fromName: string };

/** Open personal invites addressed to this account's email or verified phone. */
export async function invitesForUser(deps: CrewDeps, userId: string): Promise<InviteForYou[]> {
  const now = nowOf(deps);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const contact = await contactOf(tx, userId);
    const rows = await tx
      .select({ inviteId: crewInvites.id, crewId: crews.id, crewName: crews.name, fromName: users.name })
      .from(crewInvites)
      .innerJoin(crews, eq(crews.id, crewInvites.crewId))
      .innerJoin(users, eq(users.id, crews.ownerUserId))
      .where(and(eq(crewInvites.kind, 'personal'), openInvite(now), matchesContact(contact)))
      .orderBy(desc(crewInvites.createdAt));
    if (!rows.length) return [];
    const already = await tx
      .select({ crewId: crewMembers.crewId })
      .from(crewMembers)
      .where(
        and(
          eq(crewMembers.userId, userId),
          inArray(
            crewMembers.crewId,
            rows.map((r) => r.crewId),
          ),
        ),
      );
    const inCrew = new Set(already.map((a) => a.crewId));
    const seen = new Set<string>();
    return rows.filter((r) => !inCrew.has(r.crewId) && !seen.has(r.crewId) && seen.add(r.crewId));
  });
}

async function invitedInvite(tx: Tx, userId: string, inviteId: string, now: Date) {
  if (!z.uuid().safeParse(inviteId).success) return null;
  const contact = await contactOf(tx, userId);
  const [inv] = await tx
    .select()
    .from(crewInvites)
    .where(
      and(
        eq(crewInvites.id, inviteId),
        eq(crewInvites.kind, 'personal'),
        openInvite(now),
        matchesContact(contact),
      ),
    );
  return inv ?? null;
}

export async function acceptCrewInvite(deps: CrewDeps, userId: string, inviteId: string): Promise<string> {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const inv = await invitedInvite(tx, userId, inviteId, nowOf(deps));
    if (!inv) throw new DomainError('gone', 'That invite has expired or was canceled.');
    await addMember(tx, deps, inv.crewId, userId);
    return inv.crewId;
  });
}

export async function declineCrewInvite(deps: CrewDeps, userId: string, inviteId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const inv = await invitedInvite(tx, userId, inviteId, nowOf(deps));
    if (!inv) return;
    await tx.update(crewInvites).set({ status: 'declined' }).where(eq(crewInvites.id, inv.id));
  });
}

// ---------------------------------------------------------------------------------------------
// Links (/g/<token>): the crew's shareable link or someone's personal invite
// ---------------------------------------------------------------------------------------------

export type CrewInvitePreview = {
  crewId: string;
  name: string;
  memberCount: number;
  ownerName: string;
  /** Set for a personal invite: who it was for. */
  inviteeName: string | null;
};

/** Token from a /g/<token> link → crew preview, or null when unknown, used, revoked or expired. */
export async function resolveCrewToken(deps: CrewDeps, token: string): Promise<CrewInvitePreview | null> {
  if (!/^[0-9A-Za-z]{10,40}$/.test(token)) return null;
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const row = await inviteByToken(tx, token, nowOf(deps));
    if (!row) return null;
    const [n] = await tx
      .select({ n: count() })
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, row.crewId), eq(crewMembers.status, 'active')));
    return {
      crewId: row.crewId,
      name: row.name,
      ownerName: row.ownerName,
      inviteeName: row.inviteeName,
      memberCount: n?.n ?? 0,
    };
  });
}

async function inviteByToken(tx: Tx, token: string, now: Date) {
  const [row] = await tx
    .select({
      inviteId: crewInvites.id,
      kind: crewInvites.kind,
      crewId: crews.id,
      name: crews.name,
      ownerName: users.name,
      inviteeName: crewInvites.inviteeName,
    })
    .from(crewInvites)
    .innerJoin(crews, eq(crews.id, crewInvites.crewId))
    .innerJoin(users, eq(users.id, crews.ownerUserId))
    .where(and(eq(crewInvites.tokenHash, sha256(token)), openInvite(now)));
  return row ?? null;
}

/** Joins the crew behind an invite link (shared or personal). Idempotent. */
export async function joinCrew(deps: CrewDeps, userId: string, token: string): Promise<string> {
  if (!/^[0-9A-Za-z]{10,40}$/.test(token))
    throw new DomainError('gone', 'That crew link has expired or was turned off.');
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const inv = await inviteByToken(tx, token, nowOf(deps));
    if (!inv) throw new DomainError('gone', 'That crew link has expired or was turned off.');
    await addMember(tx, deps, inv.crewId, userId);
    // A personal link is used up once someone joins with it, whoever they are.
    if (inv.kind === 'personal') {
      await tx
        .update(crewInvites)
        .set({ status: 'accepted', acceptedBy: userId })
        .where(and(eq(crewInvites.id, inv.inviteId), eq(crewInvites.status, 'open')));
    }
    return inv.crewId;
  });
}

// ---------------------------------------------------------------------------------------------
// Leaving and removing
// ---------------------------------------------------------------------------------------------

export async function leaveCrew(deps: CrewDeps, userId: string, crewId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const me = await membership(tx, crewId, userId);
    if (!me) throw new DomainError('not_found', 'You’re not in that crew.');
    if (me.role === 'owner') {
      const [n] = await tx.select({ n: count() }).from(crewMembers).where(eq(crewMembers.crewId, crewId));
      if ((n?.n ?? 0) > 1)
        throw new DomainError('conflict', 'You own this crew. Remove the others first, or keep it.');
      await tx.delete(crews).where(eq(crews.id, crewId));
      return;
    }
    await tx.delete(crewMembers).where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)));
  });
}

export async function removeCrewMember(
  deps: CrewDeps,
  ownerUserId: string,
  crewId: string,
  memberUserId: string,
) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await requireOwner(tx, crewId, ownerUserId);
    if (memberUserId === ownerUserId) throw new DomainError('conflict', 'You can’t remove yourself.');
    await tx
      .delete(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, memberUserId)));
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${ownerUserId}`,
      action: 'crew.member_removed',
      target: `user:${memberUserId}`,
      meta: { crewId },
    });
  });
}

/** Player ids of a crew's active members (for "new outing" alerts). */
export async function crewMemberPlayerIds(tx: Tx, crewId: string): Promise<string[]> {
  const rows = await tx
    .select({ playerId: players.id })
    .from(crewMembers)
    .innerJoin(players, eq(players.userId, crewMembers.userId))
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.status, 'active')));
  return rows.map((r) => r.playerId);
}

/** True when the player's account is an active member of the crew. */
export async function isCrewMember(tx: Tx, crewId: string, playerId: string): Promise<boolean> {
  const [row] = await tx
    .select({ one: sql<number>`1` })
    .from(crewMembers)
    .innerJoin(players, eq(players.userId, crewMembers.userId))
    .where(and(eq(crewMembers.crewId, crewId), eq(players.id, playerId), eq(crewMembers.status, 'active')));
  return !!row;
}

import { and, asc, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { audit } from '../audit';
import { crewInvites, crewMembers, crews, players, users } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import { derivedToken, sha256 } from '../security/tokens';
import { parseInput } from '../validation';

export type CrewDeps = { db: Db; tenantId: string; secret: string; now?: () => Date };

export const MAX_CREWS_PER_USER = 20;

const CrewName = z.object({
  name: z.string().trim().min(1, 'Give your crew a name.').max(40, 'Keep it under 40 characters.'),
});

const tokenFor = (secret: string, inviteId: string) => derivedToken(secret, `crew:${inviteId}`);

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

export type CrewView = {
  id: string;
  name: string;
  isOwner: boolean;
  members: CrewMemberView[];
  inviteToken: string;
};

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

/** The crew's current invite token, creating a link the first time. */
async function ensureInvite(tx: Tx, deps: CrewDeps, crewId: string, userId: string) {
  const now = deps.now?.() ?? new Date();
  const [active] = await tx
    .select({ id: crewInvites.id })
    .from(crewInvites)
    .where(
      and(
        eq(crewInvites.crewId, crewId),
        isNull(crewInvites.revokedAt),
        or(isNull(crewInvites.expiresAt), gt(crewInvites.expiresAt, now)),
      ),
    )
    .orderBy(desc(crewInvites.createdAt))
    .limit(1);
  if (active) return tokenFor(deps.secret, active.id);
  const id = uuidv7();
  const token = tokenFor(deps.secret, id);
  await tx.insert(crewInvites).values({ id, crewId, tokenHash: sha256(token), createdBy: userId });
  return token;
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
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const mine = await tx
      .select({ id: crews.id, name: crews.name, role: crewMembers.role })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(and(eq(crewMembers.userId, userId), eq(crewMembers.status, 'active')))
      .orderBy(asc(crews.name));
    const out: CrewSummary[] = [];
    for (const c of mine) {
      const [counts] = await tx
        .select({
          active: sql<number>`count(*) filter (where ${crewMembers.status} = 'active')::int`,
          pending: sql<number>`count(*) filter (where ${crewMembers.status} = 'pending')::int`,
        })
        .from(crewMembers)
        .where(eq(crewMembers.crewId, c.id));
      out.push({
        id: c.id,
        name: c.name,
        memberCount: counts?.active ?? 0,
        pendingCount: counts?.pending ?? 0,
        isOwner: c.role === 'owner',
      });
    }
    return out;
  });
}

/** A crew as one of its members sees it, or null for everyone else. */
export async function getCrew(deps: CrewDeps, userId: string, crewId: string): Promise<CrewView | null> {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const me = await membership(tx, crewId, userId);
    if (!me || me.status !== 'active') return null;
    const rows = await tx
      .select({ userId: users.id, name: users.name, role: crewMembers.role, status: crewMembers.status })
      .from(crewMembers)
      .innerJoin(users, eq(users.id, crewMembers.userId))
      .where(eq(crewMembers.crewId, crewId))
      .orderBy(sql`${crewMembers.role} = 'owner' desc`, asc(crewMembers.createdAt));
    return {
      id: crewId,
      name: me.crewName,
      isOwner: me.role === 'owner',
      members: rows.map((r) => ({ ...r, isYou: r.userId === userId })),
      inviteToken: await ensureInvite(tx, deps, crewId, userId),
    };
  });
}

export async function rotateCrewInvite(deps: CrewDeps, userId: string, crewId: string) {
  const now = deps.now?.() ?? new Date();
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await requireOwner(tx, crewId, userId);
    await tx
      .update(crewInvites)
      .set({ revokedAt: now })
      .where(and(eq(crewInvites.crewId, crewId), isNull(crewInvites.revokedAt)));
    await ensureInvite(tx, deps, crewId, userId);
  });
}

export type CrewInvitePreview = { crewId: string; name: string; memberCount: number; ownerName: string };

/** Token from a /g/<token> link → crew preview, or null when unknown, revoked or expired. */
export async function resolveCrewToken(deps: CrewDeps, token: string): Promise<CrewInvitePreview | null> {
  if (!/^[0-9A-Za-z]{10,40}$/.test(token)) return null;
  const now = deps.now?.() ?? new Date();
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [row] = await tx
      .select({ crewId: crews.id, name: crews.name, ownerName: users.name })
      .from(crewInvites)
      .innerJoin(crews, eq(crews.id, crewInvites.crewId))
      .innerJoin(users, eq(users.id, crews.ownerUserId))
      .where(
        and(
          eq(crewInvites.tokenHash, sha256(token)),
          isNull(crewInvites.revokedAt),
          or(isNull(crewInvites.expiresAt), gt(crewInvites.expiresAt, now)),
        ),
      );
    if (!row) return null;
    const [n] = await tx
      .select({ n: count() })
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, row.crewId), eq(crewMembers.status, 'active')));
    return { ...row, memberCount: n?.n ?? 0 };
  });
}

/** Joins the crew behind an invite link. Idempotent. */
export async function joinCrew(deps: CrewDeps, userId: string, token: string): Promise<string> {
  const preview = await resolveCrewToken(deps, token);
  if (!preview) throw new DomainError('gone', 'That crew link has expired or was turned off.');
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await tx
      .insert(crewMembers)
      .values({ crewId: preview.crewId, userId, role: 'member', status: 'active' })
      .onConflictDoUpdate({
        target: [crewMembers.crewId, crewMembers.userId],
        set: { status: 'active', updatedAt: new Date() },
      });
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `user:${userId}`,
      action: 'crew.joined',
      target: `crew:${preview.crewId}`,
    });
  });
  return preview.crewId;
}

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

import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { inviteLinks, outings } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import { derivedToken, sha256 } from '../security/tokens';
import type { Actor } from './outings';

export type InviteDeps = { db: Db; tenantId: string; secret: string; now?: () => Date };

const tokenFor = (secret: string, linkId: string) => derivedToken(secret, `invite:${linkId}`);

async function assertOrganizer(tx: Tx, outingId: string, actor: Actor) {
  if (!z.uuid().safeParse(outingId).success) throw new DomainError('not_found', 'That outing is gone.');
  const [o] = await tx.select().from(outings).where(eq(outings.id, outingId));
  if (!o) throw new DomainError('not_found', 'That outing is gone.');
  if (o.organizerPlayerId !== actor.playerId) {
    throw new DomainError('forbidden', 'Only the organizer can share this outing.');
  }
  return o;
}

async function insertLink(tx: Tx, deps: InviteDeps, outingId: string, actor: Actor, expiresAt: Date | null) {
  const id = uuidv7();
  const token = tokenFor(deps.secret, id);
  await tx.insert(inviteLinks).values({
    id,
    outingId,
    tokenHash: sha256(token),
    expiresAt,
    createdBy: actor.playerId,
  });
  return { id, token, expiresAt };
}

/** The outing's current link, creating one the first time. Organizer only. */
export async function ensureInviteLink(deps: InviteDeps, actor: Actor, outingId: string) {
  const now = deps.now?.() ?? new Date();
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const o = await assertOrganizer(tx, outingId, actor);
    const [active] = await tx
      .select()
      .from(inviteLinks)
      .where(
        and(
          eq(inviteLinks.outingId, o.id),
          isNull(inviteLinks.revokedAt),
          or(isNull(inviteLinks.expiresAt), gt(inviteLinks.expiresAt, now)),
        ),
      )
      .orderBy(desc(inviteLinks.createdAt))
      .limit(1);
    if (active)
      return { id: active.id, token: tokenFor(deps.secret, active.id), expiresAt: active.expiresAt };
    return insertLink(tx, deps, o.id, actor, null);
  });
}

/** A fresh link (optionally expiring). Older links keep working until revoked. */
export async function createInviteLink(
  deps: InviteDeps,
  actor: Actor,
  outingId: string,
  expiresAt: Date | null,
) {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const o = await assertOrganizer(tx, outingId, actor);
    return insertLink(tx, deps, o.id, actor, expiresAt);
  });
}

/** Revokes every active link and issues a new one ("the old link stops working"). */
export async function rotateInviteLink(deps: InviteDeps, actor: Actor, outingId: string) {
  const now = deps.now?.() ?? new Date();
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const o = await assertOrganizer(tx, outingId, actor);
    await tx
      .update(inviteLinks)
      .set({ revokedAt: now })
      .where(and(eq(inviteLinks.outingId, o.id), isNull(inviteLinks.revokedAt)));
    return insertLink(tx, deps, o.id, actor, null);
  });
}

export async function revokeInviteLink(deps: InviteDeps, actor: Actor, linkId: string) {
  const now = deps.now?.() ?? new Date();
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    if (!z.uuid().safeParse(linkId).success) throw new DomainError('not_found', 'That link is gone.');
    const [link] = await tx.select().from(inviteLinks).where(eq(inviteLinks.id, linkId));
    if (!link) throw new DomainError('not_found', 'That link is gone.');
    await assertOrganizer(tx, link.outingId, actor);
    await tx.update(inviteLinks).set({ revokedAt: now }).where(eq(inviteLinks.id, linkId));
  });
}

/** Token from a URL → outing id, or null when unknown, revoked or expired. */
export async function resolveInviteToken(deps: InviteDeps, token: string): Promise<string | null> {
  if (!/^[0-9A-Za-z]{10,40}$/.test(token)) return null;
  const now = deps.now?.() ?? new Date();
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [link] = await tx
      .select({ outingId: inviteLinks.outingId })
      .from(inviteLinks)
      .where(
        and(
          eq(inviteLinks.tokenHash, sha256(token)),
          isNull(inviteLinks.revokedAt),
          or(isNull(inviteLinks.expiresAt), gt(inviteLinks.expiresAt, now)),
        ),
      );
    return link?.outingId ?? null;
  });
}

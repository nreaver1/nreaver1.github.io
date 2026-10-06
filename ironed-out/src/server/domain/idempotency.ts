import { and, eq, lt } from 'drizzle-orm';
import { idempotencyKeys } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db } from '../db/types';
import { DomainError } from '../errors';

/** Keys are remembered for a day; a request that crashed mid-flight can be retried after a minute. */
export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
const STALE_IN_FLIGHT_MS = 60_000;

export const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

export type IdempotencyDeps = { db: Db; tenantId: string; now?: () => Date };
export type Replay = { status: number; body: unknown };

/**
 * Claims `key` for this client and request. Returns a stored response to replay, or null when the
 * caller should run the request (and then call `finishIdempotent`). Reusing a key with a different
 * request is an error, as is retrying while the first attempt is still running.
 */
export async function beginIdempotent(
  deps: IdempotencyDeps,
  clientId: string,
  key: string,
  requestHash: string,
): Promise<Replay | null> {
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new DomainError('invalid_input', 'Idempotency-Key must be 1–255 visible ASCII characters.');
  }
  const now = deps.now?.() ?? new Date();
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const inserted = await tx
      .insert(idempotencyKeys)
      .values({ clientId, key, requestHash, createdAt: now })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });
    if (inserted.length) return null;

    const [row] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.clientId, clientId), eq(idempotencyKeys.key, key)))
      .for('update');
    if (!row) return null; // deleted between the two statements; run it
    const age = now.getTime() - row.createdAt.getTime();
    const restart = async () => {
      await tx
        .update(idempotencyKeys)
        .set({ requestHash, response: null, createdAt: now })
        .where(and(eq(idempotencyKeys.clientId, clientId), eq(idempotencyKeys.key, key)));
      return null;
    };
    if (age > IDEMPOTENCY_TTL_MS) return restart();
    if (row.requestHash !== requestHash) {
      throw new DomainError(
        'invalid_input',
        'This Idempotency-Key was already used for a different request.',
        {
          reason: 'idempotency_mismatch',
        },
      );
    }
    if (row.response) return row.response;
    if (age > STALE_IN_FLIGHT_MS) return restart();
    throw new DomainError(
      'conflict',
      'A request with this Idempotency-Key is still in progress. Retry shortly.',
      {
        reason: 'idempotency_in_flight',
      },
    );
  });
}

/** Stores the response for replays. Server errors aren't stored, so the client can simply retry. */
export async function finishIdempotent(
  deps: IdempotencyDeps,
  clientId: string,
  key: string,
  response: Replay,
) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const where = and(eq(idempotencyKeys.clientId, clientId), eq(idempotencyKeys.key, key));
    if (response.status >= 500) await tx.delete(idempotencyKeys).where(where);
    else await tx.update(idempotencyKeys).set({ response }).where(where);
  });
}

/** The stored response for a finished request, without claiming the key. */
export async function findIdempotent(
  deps: IdempotencyDeps,
  clientId: string,
  key: string,
): Promise<Replay | null> {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [row] = await tx
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.clientId, clientId), eq(idempotencyKeys.key, key)));
    return row?.response ?? null;
  });
}

/** Retention: forget keys older than the TTL. */
export async function pruneIdempotencyKeys(deps: IdempotencyDeps) {
  const cutoff = new Date((deps.now?.() ?? new Date()).getTime() - IDEMPOTENCY_TTL_MS);
  await withTenant(deps.db, deps.tenantId, (tx) =>
    tx.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff)),
  );
}

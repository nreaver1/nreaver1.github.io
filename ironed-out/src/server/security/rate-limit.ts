import { lt, sql } from 'drizzle-orm';
import { DomainError } from '../errors';
import { rateLimits } from '../db/schema';
import type { Db } from '../db/types';

export type Limit = { key: string; max: number; windowSec: number };

/**
 * Fixed-window counter in Postgres. Each call counts one hit per limit and throws `rate_limited`
 * once a key goes over `max` within its window. Keys must not contain raw secrets or full phone
 * numbers (hash them first).
 */
export async function hit(db: Db, limits: Limit[], now = new Date()): Promise<void> {
  for (const l of limits) {
    const windowMs = l.windowSec * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const [row] = await db
      .insert(rateLimits)
      .values({ key: l.key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    if ((row?.count ?? 0) > l.max) {
      const retryAfter = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
      throw new DomainError('rate_limited', 'Too many tries. Give it a few minutes and try again.', {
        retryAfter,
      });
    }
  }
}

/** Deletes old windows (run from the retention job). */
export async function pruneRateLimits(db: Db, olderThan: Date): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, olderThan));
}

export type LimitState = { limit: number; remaining: number; resetSec: number };

/**
 * Like `hit` for a single limit, but reports where the caller stands (for `RateLimit-*` headers).
 * Throws `rate_limited` with `retryAfter` once over.
 */
export async function consume(db: Db, l: Limit, now = new Date()): Promise<LimitState> {
  const windowMs = l.windowSec * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: l.key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 0;
  const resetSec = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  if (count > l.max) {
    throw new DomainError('rate_limited', 'Rate limit exceeded. Slow down and retry after the reset.', {
      retryAfter: resetSec,
      limit: l.max,
    });
  }
  return { limit: l.max, remaining: Math.max(0, l.max - count), resetSec };
}

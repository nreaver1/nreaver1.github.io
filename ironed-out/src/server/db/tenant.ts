import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Tx } from './types';

const TenantId = z.uuid();

/**
 * Runs `fn` in a transaction scoped to one tenant. Row-Level Security policies read
 * `app.tenant_id`, which is set with `set_config(..., true)` so it is local to this transaction
 * and can never leak to another request sharing the pooled connection.
 */
export async function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const parsed = TenantId.parse(tenantId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${parsed}, true)`);
    return fn(tx);
  });
}

import { isIP } from 'node:net';
import { auditLog } from './db/schema';
import type { Tx } from './db/types';

export type AuditEntry = {
  tenantId: string;
  actor: string; // e.g. "user:<id>", "player:<id>", "anon", "client:<id>"
  action: string; // e.g. "auth.login", "outing.player_removed"
  target?: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
};

/** Appends to the audit log inside the caller's tenant transaction. Never put secrets in meta. */
export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: e.tenantId,
    actor: e.actor,
    action: e.action,
    target: e.target ?? null,
    ip: e.ip && isIP(e.ip) ? e.ip : null,
    meta: e.meta ?? {},
  });
}

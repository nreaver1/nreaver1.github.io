import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiClients, tenants } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import { signJwt, verifyJwt } from '../security/jwt';
import { hit } from '../security/rate-limit';
import { randomToken, safeEqual, sha256 } from '../security/tokens';

/** Partner API scopes (SPEC §7). */
export const SCOPES = ['outings:read', 'outings:write', 'players:read', 'webhooks:manage'] as const;
export type Scope = (typeof SCOPES)[number];
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

export type ApiCaller = {
  /** api_clients.id (not the public client_id). */
  id: string;
  clientId: string;
  tenantId: string;
  name: string;
  scopes: Scope[];
};

export type ApiClientDeps = { db: Db; secret: string; appUrl: string; now?: () => Date };

const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);

/**
 * Runs `fn` with `app.client_id` set, which makes that one client row readable before we know its
 * tenant (the `api_clients_auth_lookup` policy). Nothing else becomes visible.
 */
async function withClientLookup<T>(db: Db, clientId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.client_id', ${clientId}, true)`);
    return fn(tx);
  });
}

/**
 * Issues a client (operator tool; runs as the schema owner). The secret is returned once and only
 * its SHA-256 is stored. `clientId`/`secret` can be fixed for tests and local fixtures.
 */
export async function createApiClient(
  db: Db,
  input: { tenantId: string; name: string; scopes: Scope[]; clientId?: string; secret?: string },
) {
  const clientId = input.clientId ?? `ioc_${randomToken(20)}`;
  const secret = input.secret ?? `ios_${randomToken(40)}`;
  const [row] = await db
    .insert(apiClients)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      clientId,
      secretHash: sha256(secret),
      scopes: [...new Set(input.scopes)],
    })
    .returning({ id: apiClients.id });
  return { id: row!.id, clientId, secret };
}

export const TokenRequest = z.object({
  grant_type: z.string(),
  client_id: z.string().min(1).max(100),
  client_secret: z.string().min(1).max(200),
  scope: z.string().max(200).optional(),
});

export type OAuthErrorCode =
  'invalid_request' | 'invalid_client' | 'invalid_scope' | 'unsupported_grant_type';
const oauthError = (code: OAuthErrorCode, message: string) =>
  new DomainError(code === 'invalid_client' ? 'unauthorized' : 'invalid_input', message, { oauth: code });

/** OAuth 2.0 client credentials grant → short-lived JWT access token. */
export async function issueAccessToken(deps: ApiClientDeps, input: unknown, ip: string | null) {
  const r = TokenRequest.safeParse(input);
  if (!r.success) throw oauthError('invalid_request', 'Send grant_type, client_id and client_secret.');
  const req = r.data;
  if (req.grant_type !== 'client_credentials') {
    throw oauthError('unsupported_grant_type', 'Only grant_type=client_credentials is supported.');
  }
  const now = deps.now?.() ?? new Date();
  await hit(
    deps.db,
    [
      { key: `oauth:ip:${ip ?? 'unknown'}`, max: 60, windowSec: 60 },
      { key: `oauth:client:${sha256(req.client_id)}`, max: 30, windowSec: 60 },
    ],
    now,
  );

  const client = await withClientLookup(deps.db, req.client_id, async (tx) => {
    const [c] = await tx
      .select({ client: apiClients, tenantStatus: tenants.status })
      .from(apiClients)
      .innerJoin(tenants, eq(tenants.id, apiClients.tenantId))
      .where(eq(apiClients.clientId, req.client_id));
    return c;
  });
  // Compare against something even when the client doesn't exist, so timing doesn't tell.
  const secretOk = safeEqual(
    sha256(req.client_secret),
    client?.client.secretHash ?? sha256('no-such-client'),
  );
  if (!client || !secretOk || client.client.revokedAt || client.tenantStatus !== 'active') {
    throw oauthError('invalid_client', 'Client authentication failed.');
  }

  const granted = client.client.scopes.filter(isScope);
  const requested = req.scope?.trim() ? req.scope.trim().split(/\s+/) : granted;
  if (!requested.every((s) => isScope(s) && granted.includes(s))) {
    throw oauthError('invalid_scope', `This client may request: ${granted.join(' ') || '(no scopes)'}.`);
  }

  await withTenant(deps.db, client.client.tenantId, (tx) =>
    tx.update(apiClients).set({ lastUsedAt: now }).where(eq(apiClients.id, client.client.id)),
  );
  const iat = Math.floor(now.getTime() / 1000);
  const scope = [...new Set(requested)].join(' ');
  const accessToken = signJwt(deps.secret, {
    iss: deps.appUrl,
    aud: 'ironed-out-api',
    sub: client.client.id,
    tid: client.client.tenantId,
    scope,
    iat,
    exp: iat + ACCESS_TOKEN_TTL_SEC,
    jti: randomToken(16),
  });
  return {
    access_token: accessToken,
    token_type: 'Bearer' as const,
    expires_in: ACCESS_TOKEN_TTL_SEC,
    scope,
  };
}

/** An API client that still exists, isn't revoked and whose tenant is active, with all its scopes. */
export async function findActiveClient(
  db: Db,
  tenantId: string,
  id: string,
): Promise<(ApiCaller & { tenantName: string }) | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [c] = await tx
      .select({ client: apiClients, tenantStatus: tenants.status, tenantName: tenants.name })
      .from(apiClients)
      .innerJoin(tenants, eq(tenants.id, apiClients.tenantId))
      .where(and(eq(apiClients.id, id), isNull(apiClients.revokedAt)));
    if (!c || c.tenantStatus !== 'active') return null;
    return {
      id: c.client.id,
      clientId: c.client.clientId,
      tenantId: c.client.tenantId,
      name: c.client.name,
      tenantName: c.tenantName,
      scopes: c.client.scopes.filter(isScope),
    };
  });
}

/**
 * Bearer token → caller. Checks the signature and expiry, then that the client still exists and
 * isn't revoked (so revoking takes effect immediately, not after the token expires).
 */
export async function authenticateAccessToken(deps: ApiClientDeps, token: string): Promise<ApiCaller | null> {
  const claims = verifyJwt(deps.secret, token, deps.now?.());
  if (!claims) return null;
  const client = await findActiveClient(deps.db, claims.tid, claims.sub);
  if (!client) return null;
  const { tenantName: _, ...caller } = client;
  // A token never carries more than the client currently has.
  return {
    ...caller,
    scopes: claims.scope.split(' ').filter((s): s is Scope => client.scopes.includes(s as Scope)),
  };
}

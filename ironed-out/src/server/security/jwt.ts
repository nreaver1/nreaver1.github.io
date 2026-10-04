import { z } from 'zod';
import { hmac, safeEqual } from './tokens';

/**
 * Minimal HS256 JWTs for partner access tokens. The signing key is derived from APP_SECRET; `kid`
 * names the derivation so it can be rotated later without breaking verification of the old one.
 */
const KID = 'v1';
const keyFor = (secret: string, kid: string) => hmac(secret, `jwt:${kid}`);

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export const AccessClaims = z.object({
  iss: z.string(),
  aud: z.literal('ironed-out-api'),
  sub: z.uuid(), // api_clients.id
  tid: z.uuid(), // tenant id
  scope: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string(),
});
export type AccessClaims = z.infer<typeof AccessClaims>;

export function signJwt(secret: string, claims: AccessClaims): string {
  const head = b64({ alg: 'HS256', typ: 'JWT', kid: KID });
  const body = b64(claims);
  const sig = hmac(keyFor(secret, KID).toString('hex'), `${head}.${body}`).toString('base64url');
  return `${head}.${body}.${sig}`;
}

/** Returns the claims, or null for anything malformed, forged, expired or not yet valid. */
export function verifyJwt(secret: string, token: string, now = new Date()): AccessClaims | null {
  if (token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const h = z.object({ alg: z.literal('HS256'), kid: z.literal(KID) }).safeParse(header);
  if (!h.success) return null;
  const expected = hmac(keyFor(secret, h.data.kid).toString('hex'), `${head}.${body}`).toString('base64url');
  if (!safeEqual(sig, expected)) return null;
  const claims = AccessClaims.safeParse(payload);
  if (!claims.success) return null;
  const t = Math.floor(now.getTime() / 1000);
  // A little clock skew either way.
  if (claims.data.exp <= t - 30 || claims.data.iat > t + 30) return null;
  return claims.data;
}

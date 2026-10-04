import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { hmac } from './tokens';

/**
 * App-level envelope for small secrets we must read back (webhook signing secrets): AES-256-GCM
 * with a key derived from APP_SECRET for one purpose. Format: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */
const keyFor = (secret: string, purpose: string) => hmac(secret, `secretbox:${purpose}`);

export function seal(secret: string, purpose: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Throws if the value was tampered with or sealed with another key. */
export function open(secret: string, purpose: string, sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unrecognized sealed value');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(secret, purpose), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/**
 * Deterministic variant for values we must still look up by equality (phone numbers, SPEC §6):
 * the IV is derived from the plaintext, so the same number always seals to the same string and
 * `WHERE phone = $1` and unique indexes keep working. Reveals only whether two values are equal.
 * Format: `e1.<iv>.<tag>.<ciphertext>`.
 */
export function sealDeterministic(secret: string, purpose: string, plaintext: string): string {
  const iv = hmac(secret, `siv:${purpose}:${plaintext}`).subarray(0, 12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['e1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export const isDeterministicSealed = (value: string) => value.startsWith('e1.');

export function openDeterministic(secret: string, purpose: string, sealed: string): string {
  return open(secret, purpose, `v1${sealed.slice(2)}`);
}

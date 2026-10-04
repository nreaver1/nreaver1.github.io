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

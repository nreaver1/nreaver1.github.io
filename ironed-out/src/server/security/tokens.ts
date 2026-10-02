import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Random base62 token. 22 chars ≈ 131 bits, comfortably over the 128-bit minimum. */
export function randomToken(length = 22): string {
  // Rejection sampling keeps the alphabet uniform (248 = 62 * 4).
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmac(secret: string, value: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

/** Deterministic base62 token derived from `value` with a server secret (~131 bits). */
export function derivedToken(secret: string, value: string, length = 22): string {
  let n = BigInt(`0x${hmac(secret, value).toString('hex')}`);
  let out = '';
  while (out.length < length) {
    out += BASE62[Number(n % 62n)];
    n /= 62n;
  }
  return out;
}

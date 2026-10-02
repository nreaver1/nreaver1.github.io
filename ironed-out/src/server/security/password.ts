import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';

// OWASP baseline for Argon2id (SPEC §6): 19 MiB, 2 iterations, 1 lane.
const OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password-just-for-timing');
  await verifyPassword(await dummyHash, password);
}

export type BreachChecker = (password: string) => Promise<boolean>;

/**
 * Have I Been Pwned range API (k-anonymity: only the first 5 hex chars of the SHA-1 leave the
 * server). Fails open: if the API is unreachable, sign-up still works.
 */
export function hibpBreachChecker(fetchImpl: typeof fetch = fetch): BreachChecker {
  return async (password) => {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return false;
      const body = await res.text();
      return body.split('\n').some((line) => {
        const [s, count] = line.trim().split(':');
        return s === suffix && Number(count) > 0;
      });
    } catch {
      return false;
    }
  };
}

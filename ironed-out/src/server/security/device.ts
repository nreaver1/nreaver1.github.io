import { z } from 'zod';
import { hmac, safeEqual } from './tokens';

export const DEVICE_TTL_DAYS = 90;

/**
 * A verified device: after someone confirms their phone, we remember the player on that browser
 * for 90 days so they can claim and drop out without another code (SPEC §3.9).
 * Format: `<playerId>.<expiresEpochSec>.<hmac>`.
 */
export function signDevice(
  secret: string,
  playerId: string,
  now = new Date(),
): { value: string; expires: Date } {
  const expires = new Date(now.getTime() + DEVICE_TTL_DAYS * 86_400_000);
  const payload = `${playerId}.${Math.floor(expires.getTime() / 1000)}`;
  return { value: `${payload}.${hmac(secret, `device:${payload}`).toString('base64url')}`, expires };
}

export function verifyDevice(secret: string, value: string | undefined, now = new Date()): string | null {
  if (!value || value.length > 200) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [playerId, exp, sig] = parts as [string, string, string];
  if (!z.uuid().safeParse(playerId).success || !/^\d+$/.test(exp)) return null;
  const expected = hmac(secret, `device:${playerId}.${exp}`).toString('base64url');
  if (!safeEqual(sig, expected)) return null;
  if (Number(exp) * 1000 < now.getTime()) return null;
  return playerId;
}

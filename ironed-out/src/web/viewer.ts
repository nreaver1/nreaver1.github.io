import 'server-only';
import { cookies } from 'next/headers';
import { viewerKeyOf } from '@/server/domain/feed';
import { getPlayerName } from '@/server/domain/outings';
import { signDevice, verifyDevice } from '@/server/security/device';
import { randomToken, sha256 } from '@/server/security/tokens';
import { getServices } from './services';
import { getCurrentUser } from './session';

export const DEVICE_COOKIE = 'io_device';
/** Random id for viewers we don't know yet, so "Since you last looked" works for them too. */
export const ANON_COOKIE = 'io_anon';

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  expires,
});

export async function setDeviceCookie(playerId: string) {
  const { secret } = await getServices();
  const { value, expires } = signDevice(secret, playerId);
  (await cookies()).set(DEVICE_COOKIE, value, cookieOptions(expires));
}

export async function clearDeviceCookie() {
  (await cookies()).delete(DEVICE_COOKIE);
}

/** Creates the anonymous viewer cookie if missing (only possible in actions/route handlers). */
export async function ensureAnonKey(): Promise<string> {
  const jar = await cookies();
  let value = jar.get(ANON_COOKIE)?.value;
  if (!value || !/^[0-9A-Za-z]{22}$/.test(value)) {
    value = randomToken();
    jar.set(ANON_COOKIE, value, cookieOptions(new Date(Date.now() + 365 * 86_400_000)));
  }
  return sha256(value);
}

export type Viewer = {
  playerId: string | null;
  /** How we know them: an account session, a verified device cookie, or not at all. */
  via: 'account' | 'device' | 'anonymous';
  name: string | null;
  /** Key for outing_views: the player id, or a hash of the anonymous cookie. */
  viewerKey: string | null;
};

/**
 * Who is looking at an invite page. Accounts win over device cookies. `tenantId` is the outing's
 * tenant: accounts only exist in the consumer tenant, and a device cookie only counts when its
 * player belongs to that tenant (players never cross tenants).
 */
export async function getViewer(tenantId?: string): Promise<Viewer> {
  const services = await getServices();
  const consumer = !tenantId || tenantId === services.tenantId;
  const user = consumer ? await getCurrentUser() : null;
  if (user) return { playerId: user.playerId, via: 'account', name: user.name, viewerKey: user.playerId };
  const jar = await cookies();
  const playerId = verifyDevice(services.secret, jar.get(DEVICE_COOKIE)?.value);
  if (
    playerId &&
    (await getPlayerName({ db: services.db, tenantId: tenantId ?? services.tenantId }, playerId))
  ) {
    return { playerId, via: 'device', name: null, viewerKey: playerId };
  }
  const anon = jar.get(ANON_COOKIE)?.value;
  return {
    playerId: null,
    via: 'anonymous',
    name: null,
    viewerKey: viewerKeyOf(null, anon ? sha256(anon) : null),
  };
}

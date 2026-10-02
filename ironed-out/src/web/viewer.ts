import 'server-only';
import { cookies } from 'next/headers';
import { signDevice, verifyDevice } from '@/server/security/device';
import { getServices } from './services';
import { getCurrentUser } from './session';

export const DEVICE_COOKIE = 'io_device';

export async function setDeviceCookie(playerId: string) {
  const { secret } = await getServices();
  const { value, expires } = signDevice(secret, playerId);
  (await cookies()).set(DEVICE_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function clearDeviceCookie() {
  (await cookies()).delete(DEVICE_COOKIE);
}

export type Viewer = {
  playerId: string | null;
  /** How we know them: an account session, a verified device cookie, or not at all. */
  via: 'account' | 'device' | 'anonymous';
  name: string | null;
};

/** Who is looking at an invite page. Accounts win over device cookies. */
export async function getViewer(): Promise<Viewer> {
  const user = await getCurrentUser();
  if (user) return { playerId: user.playerId, via: 'account', name: user.name };
  const { secret } = await getServices();
  const playerId = verifyDevice(secret, (await cookies()).get(DEVICE_COOKIE)?.value);
  return playerId
    ? { playerId, via: 'device', name: null }
    : { playerId: null, via: 'anonymous', name: null };
}

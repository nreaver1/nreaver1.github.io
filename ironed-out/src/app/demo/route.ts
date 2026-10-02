import { NextResponse } from 'next/server';
import { ensureDemoOuting } from '@/server/domain/demo';
import { hit } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { getServices } from '@/web/services';
import { requestContext } from '@/web/session';

export const dynamic = 'force-dynamic';

/** GET /demo → the sample outing's invite page (portfolio "Live demo"). SMS demo mode only. */
export async function GET(req: Request) {
  const services = await getServices();
  if (!services.smsDemo) return new NextResponse('Not found', { status: 404 });
  try {
    await hit(services.db, [
      { key: `demo:ip:${(await requestContext()).ip ?? 'unknown'}`, max: 30, windowSec: 3600 },
    ]);
  } catch (e) {
    if (isDomainError(e)) return new NextResponse('Too many requests', { status: 429 });
    throw e;
  }
  const token = await ensureDemoOuting(services);
  return NextResponse.redirect(new URL(`/t/${token}`, req.url), { status: 307 });
}

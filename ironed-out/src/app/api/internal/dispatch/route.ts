import { NextResponse } from 'next/server';
import { getEnv } from '@/server/env';
import { safeEqual } from '@/server/security/tokens';
import { dispatchNow } from '@/web/dispatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sends due texts/emails and schedules reminders. Called every few minutes by the GitHub Actions
 * schedule and daily by Vercel Cron, both with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: Request) {
  const secret = getEnv().CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const totals = await dispatchNow();
  return NextResponse.json({ ok: true, ...totals }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = handle;
export const POST = handle;

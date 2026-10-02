import { NextResponse } from 'next/server';

/** Liveness probe. Does not touch the database so it stays cheap and unauthenticated. */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}

import { NextResponse } from 'next/server';
import { buildOpenApi } from '@/server/api/openapi';
import { getEnv } from '@/server/env';

/** GET /api/v1/openapi.json (public, so tools like Swagger UI can load it). */
export function GET() {
  return NextResponse.json(buildOpenApi(getEnv().APP_URL.replace(/\/$/, '')), {
    headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  });
}

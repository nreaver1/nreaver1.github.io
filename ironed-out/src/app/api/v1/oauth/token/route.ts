import { NextResponse } from 'next/server';
import { issueAccessToken } from '@/server/domain/api-clients';
import { isDomainError } from '@/server/errors';
import { getServices } from '@/web/services';
import { requestContext } from '@/web/session';

export const dynamic = 'force-dynamic';

/** Reads HTTP Basic client credentials (RFC 6749 §2.3.1: form-encoded, then base64). */
function basicCredentials(header: string | null): Record<string, string> {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header ?? '');
  if (!m) return {};
  const decoded = Buffer.from(m[1]!, 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return {};
  try {
    return {
      client_id: decodeURIComponent(decoded.slice(0, i).replace(/\+/g, ' ')),
      client_secret: decodeURIComponent(decoded.slice(i + 1).replace(/\+/g, ' ')),
    };
  } catch {
    return {};
  }
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (/application\/x-www-form-urlencoded/i.test(type)) {
    return Object.fromEntries(new URLSearchParams(await req.text()));
  }
  if (/application\/json/i.test(type)) {
    const parsed: unknown = await req.json().catch(() => null);
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(
        Object.entries(parsed).filter((kv): kv is [string, string] => typeof kv[1] === 'string'),
      );
    }
  }
  return {};
}

/**
 * POST /api/v1/oauth/token: OAuth 2.0 client credentials grant. Errors follow RFC 6749 §5.2
 * (`{ error, error_description }`), not problem+json, so standard OAuth clients understand them.
 */
export async function POST(req: Request) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
  const input = { ...(await readForm(req)), ...basicCredentials(req.headers.get('authorization')) };
  const s = await getServices();
  try {
    const { ip } = await requestContext();
    const token = await issueAccessToken({ db: s.db, secret: s.secret, appUrl: s.appUrl }, input, ip);
    return NextResponse.json(token, { headers });
  } catch (e) {
    if (!isDomainError(e)) throw e;
    const limited = e.code === 'rate_limited';
    const code = limited ? 'slow_down' : ((e.details?.oauth as string | undefined) ?? 'invalid_request');
    const status = limited ? 429 : code === 'invalid_client' ? 401 : 400;
    if (status === 401) headers['WWW-Authenticate'] = 'Basic realm="ironed-out-api"';
    if (typeof e.details?.retryAfter === 'number') headers['Retry-After'] = String(e.details.retryAfter);
    return NextResponse.json({ error: code, error_description: e.message }, { status, headers });
  }
}

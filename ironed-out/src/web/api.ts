import 'server-only';
import { randomUUID } from 'node:crypto';
import { authenticateAccessToken, type ApiCaller, type Scope } from '@/server/domain/api-clients';
import { beginIdempotent, finishIdempotent } from '@/server/domain/idempotency';
import type { PartnerDeps } from '@/server/domain/partner-outings';
import type { DomainError } from '@/server/errors';
import { isDomainError, type DomainErrorCode } from '@/server/errors';
import { consume, type LimitState } from '@/server/security/rate-limit';
import { sha256 } from '@/server/security/tokens';
import { getServices } from './services';

/**
 * Glue between Next.js route handlers and the partner API (SPEC §7): bearer auth, scopes,
 * per-client rate limits, Idempotency-Key on POST, X-Request-Id and RFC 9457 problem responses.
 * Handlers stay thin and call into `src/server/domain`.
 */

export const API_RATE_LIMIT = { max: 300, windowSec: 60 };
const MAX_BODY_BYTES = 64 * 1024;

export type ApiDeps = PartnerDeps & { allowInsecureUrls: boolean };

export type ApiContext = {
  req: Request;
  caller: ApiCaller;
  deps: ApiDeps;
  params: Record<string, string>;
  body: unknown;
  query: URLSearchParams;
};

export type ApiResult = { status?: number; body?: unknown };

type Handler = (ctx: ApiContext) => Promise<ApiResult>;
type RouteCtx = { params: Promise<Record<string, string>> };

const STATUS: Record<DomainErrorCode, number> = {
  invalid_input: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  gone: 410,
};

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
};

const requestIdOf = (req: Request) => {
  const incoming = req.headers.get('x-request-id');
  return incoming && /^[\w.:-]{1,100}$/.test(incoming) ? incoming : randomUUID();
};

/** RFC 9457 problem details. `type` links to the error section of the API docs. */
export function problem(
  appUrl: string,
  status: number,
  detail: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const code = typeof extra.code === 'string' ? extra.code : `http_${status}`;
  return Response.json(
    {
      type: `${appUrl}/developers#error-${code}`,
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      ...extra,
      code,
    },
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
  );
}

function fromDomainError(appUrl: string, e: DomainError, headers: Record<string, string>) {
  const status = STATUS[e.code];
  const d = e.details ?? {};
  const extra: Record<string, unknown> = { code: (d.reason as string | undefined) ?? e.code };
  if (d.fields) extra.errors = d.fields;
  if (d.outing) extra.outing = d.outing;
  if (status === 429 && typeof d.retryAfter === 'number') headers['Retry-After'] = String(d.retryAfter);
  return problem(appUrl, status, e.message, extra, headers);
}

const rateHeaders = (s: LimitState): Record<string, string> => ({
  'RateLimit-Limit': String(s.limit),
  'RateLimit-Remaining': String(s.remaining),
  'RateLimit-Reset': String(s.resetSec),
  'RateLimit-Policy': `${API_RATE_LIMIT.max};w=${API_RATE_LIMIT.windowSec}`,
});

async function readBody(req: Request): Promise<{ text: string; json: unknown }> {
  if (req.method === 'GET' || req.method === 'DELETE') return { text: '', json: undefined };
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw new HttpError(413, `Request bodies are limited to ${MAX_BODY_BYTES / 1024} KB.`);
  }
  if (!text.trim()) return { text: '', json: {} };
  if (!/^application\/(.+\+)?json\b/i.test(req.headers.get('content-type') ?? '')) {
    throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  }
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    throw new HttpError(400, 'The request body isn’t valid JSON.', 'invalid_json');
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function apiRoute(opts: { scope?: Scope; idempotent?: boolean }, handler: Handler) {
  return async (req: Request, route: RouteCtx): Promise<Response> => {
    const requestId = requestIdOf(req);
    const services = await getServices();
    const headers: Record<string, string> = { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' };
    const finish = (res: Response) => {
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    };
    let idem: { clientId: string; key: string; tenantId: string } | null = null;
    let deps: ApiDeps | null = null;

    try {
      const auth = req.headers.get('authorization') ?? '';
      const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
      const caller = token
        ? await authenticateAccessToken(
            { db: services.db, secret: services.secret, appUrl: services.appUrl },
            token,
          )
        : null;
      if (!caller) {
        headers['WWW-Authenticate'] = token ? 'Bearer error="invalid_token"' : 'Bearer';
        return finish(
          problem(services.appUrl, 401, 'Send a valid access token: Authorization: Bearer <token>.', {
            code: token ? 'invalid_token' : 'missing_token',
          }),
        );
      }
      if (opts.scope && !caller.scopes.includes(opts.scope)) {
        headers['WWW-Authenticate'] = `Bearer error="insufficient_scope", scope="${opts.scope}"`;
        return finish(
          problem(services.appUrl, 403, `This needs the ${opts.scope} scope.`, {
            code: 'insufficient_scope',
          }),
        );
      }
      Object.assign(
        headers,
        rateHeaders(await consume(services.db, { key: `api:client:${caller.id}`, ...API_RATE_LIMIT })),
      );

      deps = {
        db: services.db,
        tenantId: caller.tenantId,
        secret: services.secret,
        appUrl: services.appUrl,
        allowInsecureUrls: process.env.NODE_ENV !== 'production',
      };
      const body = await readBody(req);

      if (opts.idempotent) {
        const key = req.headers.get('idempotency-key');
        if (!key)
          throw new HttpError(
            400,
            'POST requests need an Idempotency-Key header.',
            'idempotency_key_required',
          );
        const url = new URL(req.url);
        const replay = await beginIdempotent(
          deps,
          caller.id,
          key,
          sha256(`${req.method} ${url.pathname}${url.search}\n${body.text}`),
        );
        if (replay) {
          headers['Idempotent-Replayed'] = 'true';
          return finish(Response.json(replay.body ?? null, { status: replay.status }));
        }
        idem = { clientId: caller.id, key, tenantId: caller.tenantId };
      }

      const url = new URL(req.url);
      const result = await handler({
        req,
        caller,
        deps,
        params: await route.params,
        body: body.json,
        query: url.searchParams,
      });
      const status = result.status ?? 200;
      if (idem) await finishIdempotent(deps, idem.clientId, idem.key, { status, body: result.body ?? null });
      return finish(status === 204 ? new Response(null, { status }) : Response.json(result.body, { status }));
    } catch (e) {
      let res: Response;
      if (isDomainError(e)) res = fromDomainError(services.appUrl, e, headers);
      else if (e instanceof HttpError)
        res = problem(services.appUrl, e.status, e.message, e.code ? { code: e.code } : {});
      else {
        console.error('api error', requestId, e instanceof Error ? e.message : 'unknown error');
        res = problem(
          services.appUrl,
          500,
          'Something went wrong on our side. Retry, or quote the request id.',
          {
            code: 'internal_error',
          },
        );
      }
      if (idem && deps) {
        const stored = { status: res.status, body: await res.clone().json() };
        await finishIdempotent(deps, idem.clientId, idem.key, stored).catch(() => undefined);
      }
      return finish(res);
    }
  };
}

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content Security Policy with a fresh nonce per request (SPEC §6: no inline scripts). Next.js
 * reads the nonce from the request's CSP header and puts it on its own scripts; 'strict-dynamic'
 * lets those load the rest of the bundle. Inline style attributes are still allowed (React
 * `style={}` props); the other baseline headers live in next.config.ts.
 */
export function cspFor(nonce: string, dev: boolean, https = !dev): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const https =
    (request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')) === 'https';
  const csp = cspFor(nonce, process.env.NODE_ENV === 'development', https);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes return JSON, and static files don't need a nonce.
      source: '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

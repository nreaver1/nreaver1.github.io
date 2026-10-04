import type { Metadata } from 'next';
import Link from 'next/link';
import { buildOpenApi } from '@/server/api/openapi';
import { ACCESS_TOKEN_TTL_SEC, SCOPES } from '@/server/domain/api-clients';
import { WEBHOOK_EVENTS } from '@/server/domain/webhooks';
import { getEnv } from '@/server/env';
import { API_RATE_LIMIT } from '@/web/api';
import styles from './developers.module.css';

export const metadata: Metadata = {
  title: 'Partner API',
  description: 'Create golf outings from a booking and follow who claims each spot.',
};

const METHODS = ['get', 'post', 'patch', 'delete'] as const;

const SCOPE_TEXT: Record<(typeof SCOPES)[number], string> = {
  'outings:read': 'Read outings and tee sheets.',
  'outings:write': 'Create and change outings, seat and release golfers, manage invite links.',
  'players:read': 'See golfer names on tee sheets (otherwise spots are just open or taken).',
  'webhooks:manage': 'Add, change and remove webhook endpoints.',
};

const EVENT_TEXT: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  'outing.created': 'A new outing (from the app or the API).',
  'outing.updated': 'Note or price changed. data.fields says which.',
  'outing.locked': 'The organizer locked the tee sheet.',
  'outing.unlocked': 'The tee sheet is open again.',
  'outing.full': 'The last open spot was just claimed.',
  'slot.claimed': 'A golfer took a spot (data.guest_count guests came along).',
  'slot.released': 'A golfer dropped out (reason dropped_out) or was taken off (reason removed).',
  'tee_time.added': 'A tee time was added after the last one.',
  'tee_time.removed': 'An empty tee time was deleted.',
  'tee_time.capacity_changed': 'A tee time gained or lost spots (data.from → data.to).',
};

const ERRORS: [string, number, string][] = [
  [
    'missing_token / invalid_token',
    401,
    'No bearer token, or it expired (tokens last 15 minutes). Get a new one.',
  ],
  ['insufficient_scope', 403, 'The token doesn’t carry the scope this endpoint needs.'],
  ['not_found', 404, 'No such id in your tenant. Other tenants’ data is never visible.'],
  ['invalid_input', 422, 'Validation failed. errors maps each field to a message.'],
  ['invalid_json', 400, 'The body isn’t JSON.'],
  ['idempotency_key_required', 400, 'POST requests need an Idempotency-Key header.'],
  ['idempotency_mismatch', 422, 'The key was already used with a different request body or path.'],
  ['idempotency_in_flight', 409, 'The first request with this key is still running. Retry in a moment.'],
  ['slot_taken', 409, 'Someone got there first. outing holds the current tee sheet.'],
  ['already_in', 409, 'That golfer already has a spot in this outing.'],
  ['no_room', 409, 'Not enough open spots for the guests.'],
  ['locked', 409, 'The outing is locked; unlock it first.'],
  ['conflict', 409, 'Any other state conflict (e.g. deleting a tee time with golfers in it).'],
  ['rate_limited', 429, 'Over the limit. Wait Retry-After seconds.'],
  [
    'internal_error',
    500,
    'Our fault. Retry with the same Idempotency-Key; quote X-Request-Id if it persists.',
  ],
];

const anchorOf = (code: string) => code.split(' / ')[0]!;

export default function DevelopersPage() {
  const appUrl = getEnv().APP_URL.replace(/\/$/, '');
  const api = `${appUrl}/api/v1`;
  const doc = buildOpenApi(appUrl);
  const endpoints = Object.entries(doc.paths).flatMap(([path, ops]) =>
    METHODS.filter((m) => m in ops).map((m) => {
      const op = (ops as Record<string, { summary: string; description?: string }>)[m]!;
      const scope = /`([a-z]+:[a-z]+)`/.exec(op.description ?? '')?.[1] ?? null;
      return { method: m.toUpperCase(), path, summary: op.summary, scope };
    }),
  );

  return (
    <main className={`page ${styles.docs}`}>
      <p>
        <Link href="/">Ironed Out</Link>
      </p>
      <h1 className={styles.title}>Partner API</h1>
      <p className={styles.lead}>
        For tee-time booking platforms: when a golfer books 2 or 3 tee times, create the outing for them, hand
        back one invite link for the group chat, and hear about every claim and drop-out.
      </p>
      <nav aria-label="On this page" className={styles.toc}>
        <a href="#access">Access</a>
        <a href="#auth">Tokens</a>
        <a href="#quickstart">Quickstart</a>
        <a href="#conventions">Conventions</a>
        <a href="#endpoints">Endpoints</a>
        <a href="#webhooks">Webhooks</a>
        <a href="#errors">Errors</a>
        <a href={`${api}/openapi.json`}>OpenAPI 3.1</a>
      </nav>

      <section id="access" className={styles.section}>
        <h2>Access</h2>
        <p>
          Each partner gets its own tenant and one or more API clients. Your outings, golfers and webhooks are
          isolated from everyone else’s at the database level (Postgres row-level security). Ask us for a
          client; you’ll get a <code>client_id</code> and a <code>client_secret</code> once. Keep the secret
          on your servers: the API has no CORS, so it can’t be called from a browser.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Scope</th>
              <th scope="col">Lets you</th>
            </tr>
          </thead>
          <tbody>
            {SCOPES.map((s) => (
              <tr key={s}>
                <td>
                  <code>{s}</code>
                </td>
                <td>{SCOPE_TEXT[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="auth" className={styles.section}>
        <h2>Tokens</h2>
        <p>
          OAuth 2.0 client credentials. Tokens are JWTs that last {ACCESS_TOKEN_TTL_SEC / 60} minutes; ask for
          a subset of your scopes with <code>scope</code>. Revoking a client stops its tokens immediately.
        </p>
        <pre className={styles.code} tabIndex={0}>{`curl -s ${api}/oauth/token \\
  -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d grant_type=client_credentials \\
  -d scope="outings:read outings:write players:read"

{ "access_token": "eyJ…", "token_type": "Bearer", "expires_in": ${ACCESS_TOKEN_TTL_SEC}, "scope": "…" }`}</pre>
      </section>

      <section id="quickstart" className={styles.section}>
        <h2>Quickstart</h2>
        <p>Find the course, then create the outing from the booking. The organizer takes the first spot.</p>
        <pre
          className={styles.code}
          tabIndex={0}
        >{`curl -s "${api}/courses?query=pleasant" -H "Authorization: Bearer $TOKEN"

curl -s ${api}/outings \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "course_id": "<id from /courses>",
    "play_date": "2026-10-17",
    "tee_times": { "first": "07:40", "count": 3, "players_each": 4, "interval_minutes": 10 },
    "price_cents": 4500,
    "external_ref": "RES-88231",
    "organizer": { "name": "Mike Brennan", "phone": "410-555-0142" },
    "players": [{ "name": "Dave K" }]
  }'`}</pre>
        <p>
          The response is the outing with its tee sheet and <code>invite_url</code>. Show that link to the
          golfer (“Invite your group”): friends open it, pick a spot and confirm their number by text. No
          account needed.
        </p>
      </section>

      <section id="conventions" className={styles.section}>
        <h2>Conventions</h2>
        <ul className={styles.list}>
          <li>
            JSON in and out, snake_case fields, ISO-8601 timestamps in UTC. Tee times are created in the
            course’s local time.
          </li>
          <li>
            Every <code>POST</code> needs an <code>Idempotency-Key</code> header (any unique string up to 255
            characters). Retrying with the same key replays the first response for 24 hours and adds{' '}
            <code>Idempotent-Replayed: true</code>.
          </li>
          <li>
            Lists use cursors: pass <code>next_cursor</code> back as <code>?cursor=</code> until it’s null.
          </li>
          <li>
            Each client gets {API_RATE_LIMIT.max} requests per {API_RATE_LIMIT.windowSec} seconds. Responses
            carry <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> and{' '}
            <code>RateLimit-Reset</code>; a 429 carries <code>Retry-After</code>.
          </li>
          <li>
            Send an <code>X-Request-Id</code> to trace a call; we echo it (or make one up) on every response.
          </li>
          <li>
            Golfer phone numbers you send are used to match the same person across outings, but they aren’t
            verified, so we don’t text them until the golfer confirms the number on the invite page. Phone
            numbers are never returned.
          </li>
          <li>Versioned by URL. Breaking changes get a new version; fields may be added at any time.</li>
        </ul>
      </section>

      <section id="endpoints" className={styles.section}>
        <h2>Endpoints</h2>
        <p>
          Base URL <code>{api}</code>. Full schemas: <a href={`${api}/openapi.json`}>openapi.json</a> (load it
          in any OpenAPI viewer or client generator).
        </p>
        <ul className={styles.endpoints}>
          {endpoints.map((e) => (
            <li key={`${e.method} ${e.path}`}>
              <span className={styles.method} data-method={e.method}>
                {e.method}
              </span>
              <code className={styles.path}>{e.path}</code>
              <span className={styles.summary}>
                {e.summary}
                {e.scope && <span className="muted"> · {e.scope}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="webhooks" className={styles.section}>
        <h2>Webhooks</h2>
        <p>
          Register an https endpoint with <code>POST /webhooks</code> and the events you want. We POST JSON
          within a few minutes of each change; any 2xx is success. Failures are retried with exponential
          backoff (1 minute doubling to an hour) for 24 hours. <code>GET /webhooks/:id/deliveries</code> shows
          recent attempts.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {WEBHOOK_EVENTS.map((e) => (
              <tr key={e}>
                <td>
                  <code>{e}</code>
                </td>
                <td>{EVENT_TEXT[e]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre className={styles.code} tabIndex={0}>{`POST /your/endpoint
Ironed-Signature: t=1791200000,v1=5f2c…
Ironed-Event: slot.claimed
Ironed-Delivery: 0199b1c2-…

{
  "id": "0199b1c2-…",            // unique per delivery: dedupe on this
  "type": "slot.claimed",
  "api_version": "2026-10-01",
  "created_at": "2026-10-04T14:03:11.000Z",
  "data": {
    "outing_id": "…", "external_ref": "RES-88231",
    "slot_id": "…", "starts_at": "2026-10-17T11:50:00.000Z",
    "player": { "id": "…", "name": "Jen Park" },
    "guest_count": 1, "guest_slot_ids": ["…"]
  }
}`}</pre>
        <p>
          Verify every delivery: compute HMAC-SHA256 of <code>{'`${t}.${rawBody}`'}</code> with your
          endpoint’s signing secret and compare it to <code>v1</code> in constant time. Reject timestamps more
          than 5 minutes old, and ignore an <code>id</code> you’ve already processed, so a captured request
          can’t be replayed.
        </p>
        <pre className={styles.code} tabIndex={0}>{`import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, rawBody, header) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(\`\${parts.t}.\${rawBody}\`).digest('hex');
  return expected.length === parts.v1?.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}`}</pre>
      </section>

      <section id="errors" className={styles.section}>
        <h2>Errors</h2>
        <p>
          Errors are <code>application/problem+json</code> (RFC 9457) with a stable <code>code</code>. The
          token endpoint uses OAuth’s own format instead (<code>{'{ error, error_description }'}</code>).
        </p>
        <pre className={styles.code} tabIndex={0}>{`HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{ "type": "${appUrl}/developers#error-slot_taken", "title": "Conflict", "status": 409,
  "detail": "Someone just grabbed that spot. Pick another one.", "code": "slot_taken",
  "outing": { …current tee sheet… } }`}</pre>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">code</th>
              <th scope="col">Status</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ERRORS.map(([code, status, text]) => (
              <tr key={code} id={`error-${anchorOf(code)}`}>
                <td>
                  <code>{code}</code>
                </td>
                <td>{status}</td>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

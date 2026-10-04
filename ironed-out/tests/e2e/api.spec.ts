import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_API_CLIENT, E2E_CRON_SECRET } from './api-fixture';
import { claimWithPhone, uniquePhone } from './helpers';

/** The partner API over real HTTP: token → outing → claim conflict → webhook → invite page. */

type Hook = { headers: Record<string, string | string[] | undefined>; body: string };

let receiver: Server;
let receiverUrl = '';
const hooks: Hook[] = [];

test.beforeAll(async () => {
  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      hooks.push({ headers: req.headers, body });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks`;
});
test.afterAll(() => {
  receiver.close();
});

const nextSaturday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21 + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};

async function token(request: APIRequestContext, scope?: string) {
  const res = await request.post('/api/v1/oauth/token', {
    headers: {
      Authorization: `Basic ${Buffer.from(`${E2E_API_CLIENT.id}:${E2E_API_CLIENT.secret}`).toString('base64')}`,
    },
    form: { grant_type: 'client_credentials', ...(scope ? { scope } : {}) },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

let keyN = 0;
const key = () => `e2e-${Date.now()}-${keyN++}`;

test('partner creates an outing, golfers claim, webhooks arrive signed', async ({ request, browser }) => {
  // Auth failures.
  const bad = await request.post('/api/v1/oauth/token', {
    form: { grant_type: 'client_credentials', client_id: E2E_API_CLIENT.id, client_secret: 'wrong' },
  });
  expect(bad.status()).toBe(401);
  expect(await bad.json()).toMatchObject({ error: 'invalid_client' });
  const anon = await request.get('/api/v1/outings');
  expect(anon.status()).toBe(401);
  expect(anon.headers()['content-type']).toContain('application/problem+json');
  expect(anon.headers()['x-request-id']).toBeTruthy();

  const tok = await token(request);
  const auth = { Authorization: `Bearer ${tok}` };

  // Scopes are enforced.
  const readOnly = { Authorization: `Bearer ${await token(request, 'outings:read')}` };
  const denied = await request.get('/api/v1/webhooks', { headers: readOnly });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ code: 'insufficient_scope' });

  // Webhook endpoint (a local receiver; allowed outside production).
  const hookRes = await request.post('/api/v1/webhooks', {
    headers: { ...auth, 'Idempotency-Key': key() },
    data: { url: receiverUrl, events: ['outing.created', 'slot.claimed'] },
  });
  expect(hookRes.status()).toBe(201);
  const { secret: signingSecret } = (await hookRes.json()) as { secret: string };

  // Course search.
  const courses = await request.get('/api/v1/courses?query=Mount%20Pleasant', { headers: auth });
  expect(courses.headers()['ratelimit-limit']).toBe('300');
  const course = ((await courses.json()) as { data: { id: string; name: string }[] }).data[0]!;
  expect(course.name).toBe('Mount Pleasant Golf Course');

  // POST needs an Idempotency-Key; the same key replays the same outing.
  const body = {
    course_id: course.id,
    play_date: nextSaturday(),
    tee_times: { first: '07:40', count: 2, players_each: 4 },
    external_ref: `RES-${Date.now()}`,
    organizer: { name: 'Pat Partner' },
    players: [{ name: 'Sam Swing' }],
  };
  expect((await request.post('/api/v1/outings', { headers: auth, data: body })).status()).toBe(400);
  const k = key();
  const created = await request.post('/api/v1/outings', {
    headers: { ...auth, 'Idempotency-Key': k },
    data: body,
  });
  expect(created.status()).toBe(201);
  const outing = (await created.json()) as {
    id: string;
    invite_url: string;
    open_count: number;
    tee_times: { slots: { id: string; status: string }[] }[];
  };
  expect(outing.open_count).toBe(6);
  const replay = await request.post('/api/v1/outings', {
    headers: { ...auth, 'Idempotency-Key': k },
    data: body,
  });
  expect(replay.headers()['idempotent-replayed']).toBe('true');
  expect(((await replay.json()) as { id: string }).id).toBe(outing.id);
  const mismatch = await request.post('/api/v1/outings', {
    headers: { ...auth, 'Idempotency-Key': k },
    data: { ...body, note: 'different' },
  });
  expect(mismatch.status()).toBe(422);

  // Validation errors are problem+json with field errors.
  const invalid = await request.post('/api/v1/outings', {
    headers: { ...auth, 'Idempotency-Key': key() },
    data: { ...body, tee_times: { first: 'noon' } },
  });
  expect(invalid.status()).toBe(422);
  expect(await invalid.json()).toMatchObject({
    code: 'invalid_input',
    errors: { tee_times: expect.any(String) },
  });

  // Claim a spot; claiming it again is a 409 carrying the current tee sheet.
  const slotId = outing.tee_times[0]!.slots[2]!.id;
  const claim = await request.post(`/api/v1/slots/${slotId}/claim`, {
    headers: { ...auth, 'Idempotency-Key': key() },
    data: { player: { name: 'Kim Chip' } },
  });
  expect(claim.status()).toBe(201);
  const taken = await request.post(`/api/v1/slots/${slotId}/claim`, {
    headers: { ...auth, 'Idempotency-Key': key() },
    data: { player: { name: 'Late Larry' } },
  });
  expect(taken.status()).toBe(409);
  expect(await taken.json()).toMatchObject({ code: 'slot_taken', outing: { id: outing.id, open_count: 5 } });

  // A golfer opens the partner's invite link and claims through the normal page.
  expect(outing.invite_url).toMatch(/\/t\/[0-9A-Za-z]{22}$/);
  const friend = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await friend.setExtraHTTPHeaders({ 'x-forwarded-for': '10.77.0.1' });
  await friend.goto(new URL(outing.invite_url).pathname);
  await expect(friend.getByRole('heading', { name: 'Mount Pleasant Golf Course' })).toBeVisible();
  await expect(friend.getByText('5 of 8 spots open')).toBeVisible();
  await claimWithPhone(friend, '7:50 AM', 'Riley Rough', uniquePhone());
  await expect(friend.getByText('You’re in for 7:50 AM.')).toBeVisible();

  const after = await request.get(`/api/v1/outings/${outing.id}`, { headers: auth });
  const sheet = (await after.json()) as {
    open_count: number;
    tee_times: { slots: { player?: { name: string } | null }[] }[];
  };
  expect(sheet.open_count).toBe(4);
  expect(sheet.tee_times[1]!.slots.map((s) => s.player?.name).filter(Boolean)).toContain('Riley Rough');

  // Deliver webhooks now and check the signatures.
  const run = await request.post('/api/internal/dispatch', {
    headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  await expect
    .poll(() => hooks.filter((h) => JSON.parse(h.body).data?.outing_id === outing.id).length)
    .toBe(4);
  for (const h of hooks) {
    const sig = String(h.headers['ironed-signature']);
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(sig)!;
    expect(createHmac('sha256', signingSecret).update(`${t}.${h.body}`).digest('hex')).toBe(v1);
  }
  const types = hooks.map((h) => JSON.parse(h.body).type as string).sort();
  // Created, Sam pre-filled, Kim via API, Riley via the invite page.
  expect(types).toEqual(['outing.created', 'slot.claimed', 'slot.claimed', 'slot.claimed']);

  // OpenAPI and docs are public.
  const spec = await request.get('/api/v1/openapi.json');
  expect(((await spec.json()) as { openapi: string }).openapi).toBe('3.1.0');
});

test('the API guide renders', async ({ page }) => {
  await page.goto('/developers');
  await expect(page.getByRole('heading', { name: 'Partner API', level: 1 })).toBeVisible();
  await expect(page.getByText('/outings/{id}').first()).toBeVisible();
  await expect(page.locator('#error-slot_taken')).toBeAttached();
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_API_CLIENT } from './api-fixture';

/** The partner widget: embed script on a booking page → hosted page → one outing → invite link. */

async function axe(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    violations.map((v) => `${label}: ${v.id} ${v.help}`),
    label,
  ).toEqual([]);
}

function watchCsp(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function accessToken(request: APIRequestContext) {
  const res = await request.post('/api/v1/oauth/token', {
    headers: {
      Authorization: `Basic ${Buffer.from(`${E2E_API_CLIENT.id}:${E2E_API_CLIENT.secret}`).toString('base64')}`,
    },
    form: { grant_type: 'client_credentials' },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

test('demo booking page: the button opens our page, which makes the outing once', async ({
  page,
  context,
}) => {
  const csp = watchCsp(page);
  await page.goto('/developers/widget');
  const button = page.locator('.ironed-out-button a');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName(/Invite your group.*opens in a new tab/);
  await expect(page.locator('a[data-ironed-out]')).toBeHidden();
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await axe(page, '/developers/widget');

  const [hosted] = await Promise.all([context.waitForEvent('page'), button.click()]);
  await hosted.waitForLoadState();
  expect(new URL(hosted.url()).pathname).toMatch(/^\/w\/[\w.-]+$/);
  await expect(hosted.getByRole('heading', { name: 'Invite your group' })).toBeVisible();
  await expect(hosted.getByText('Booked with Fairway Finder (demo)')).toBeVisible();
  await expect(hosted.getByText('7:40 AM · 7:50 AM · 8:00 AM')).toBeVisible();
  await axe(hosted, '/w (before)');

  await hosted.getByRole('button', { name: 'Make the invite link' }).click();
  await expect(hosted.getByRole('heading', { name: 'Link’s ready!' })).toBeVisible();
  const link = await hosted.getByLabel('Invite link').textContent();
  expect(link).toMatch(/\/t\/[0-9A-Za-z]{22}$/);
  await axe(hosted, '/w (after)');

  // Coming back to the same button shows the same link, not a second outing.
  await hosted.reload();
  await expect(hosted.getByLabel('Invite link')).toHaveText(link!);

  await hosted.getByRole('link', { name: 'See the invite page' }).click();
  await expect(hosted.getByText('Mount Pleasant Golf Course').first()).toBeVisible();
  expect(csp).toEqual([]);
});

test('partner API: widget token → hosted page; tampered tokens are refused', async ({ request, page }) => {
  const token = await accessToken(request);
  const courses = await request.get('/api/v1/courses?query=pleasant', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const courseId = ((await courses.json()) as { data: { id: string }[] }).data[0]!.id;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  const res = await request.post('/api/v1/widget-tokens', {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': `widget-${Date.now()}` },
    data: {
      course_id: courseId,
      play_date: d.toISOString().slice(0, 10),
      tee_times: { first: '09:00', count: 2 },
      external_ref: 'E2E-WIDGET',
      organizer: { name: 'Robin Booker', phone: '410-555-0188' },
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { url: string; token: string; expires_at: string };
  expect(body.url).toContain('/w/');
  expect(body.token).not.toContain('Robin');

  await page.goto(new URL(body.url).pathname);
  await expect(page.getByText('8, with Robin Booker in the first')).toBeVisible();
  await page.getByRole('button', { name: 'Make the invite link' }).click();
  await expect(page.getByRole('heading', { name: 'Link’s ready!' })).toBeVisible();

  const outings = await request.get('/api/v1/outings?external_ref=E2E-WIDGET', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(((await outings.json()) as { data: unknown[] }).data).toHaveLength(1);

  await page.goto(`/w/${body.token.slice(0, -2)}xx`);
  await expect(page.getByRole('heading', { name: 'This button has expired' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { claimWithPhone, createOuting, freshIp, PASSWORD, signUp, uniquePhone } from './helpers';

/**
 * The whole story in one go (SPEC §10 M9): an organizer sets up an outing, friends claim from the
 * link, the organizer manages the sheet, locks it, and finally deletes their account.
 */
test('organizer → invitees → manage → lock → account export and deletion', async ({ page, browser }) => {
  // Every page carries a nonce-based CSP, and nothing on the way trips it.
  const cspErrors: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
  });

  await signUp(page, 'Mike Golfer');
  const { id, invitePath } = await createOuting(page);
  const res = await page.request.get(invitePath);
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(res.headers()['strict-transport-security']).toContain('max-age=');

  // Two friends claim from the link on their phones.
  const chris = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  chris.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
  });
  await freshIp(chris);
  await chris.goto(invitePath);
  await claimWithPhone(chris, '7:40 AM', 'Chris Chipper', uniquePhone(), 1);
  await chris.getByRole('button', { name: 'Sweet' }).click();

  const jen = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await freshIp(jen);
  await jen.goto(invitePath);
  await claimWithPhone(jen, '7:50 AM', 'Jen Putts', uniquePhone());
  await jen.getByRole('button', { name: 'Sweet' }).click();
  await expect(jen.getByText('8 of 12 spots open')).toBeVisible();

  // The organizer sees everyone, takes Chris (and guest) off, and locks the outing.
  await page.goto(`/outings/${id}`);
  await expect(page.getByText('Chris Chipper', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Chris Chipper', exact: true }).click();
  await expect(page.getByText('10 of 12 spots open')).toBeVisible();
  await page.getByRole('button', { name: 'Lock it in' }).click();
  await expect(page.getByText('Locked in', { exact: true })).toBeVisible();

  // Chris comes back: they're off the sheet and can't grab a spot while it's locked.
  await chris.reload();
  await expect(chris.getByText('Chris Chipper (you)')).toHaveCount(0);
  await expect(chris.getByText('Locked in', { exact: true })).toBeVisible();
  await expect(chris.getByRole('button', { name: /Open spot.*Grab it/ })).toHaveCount(0);

  // Jen can't drop out of a locked outing either.
  await jen.reload();
  await expect(jen.getByRole('button', { name: 'Drop out' })).toHaveCount(0);

  // Unlock; Jen sees what changed since she last looked.
  await page.getByRole('button', { name: 'Unlock the outing' }).click();
  await jen.reload();
  await expect(jen.getByRole('heading', { name: 'Since you last looked' })).toBeVisible();

  // Account: export, then delete. The outing goes with it; Jen's link stops showing it.
  await page.goto('/settings/account');
  const exported = await page.request.get('/settings/account/export');
  expect(exported.headers()['content-disposition']).toContain('attachment');
  const data = (await exported.json()) as { account: { name: string }; outings_organized: { id: string }[] };
  expect(data.account.name).toBe('Mike Golfer');
  expect(data.outings_organized.map((o) => o.id)).toContain(id);

  await page.getByLabel('Your password').fill('not-my-password');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('That password isn’t right.')).toBeVisible();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Your account is deleted.')).toBeVisible();
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login/);

  await jen.reload();
  await expect(jen.getByRole('heading', { name: 'This link has run its course' })).toBeVisible();

  expect(cspErrors).toEqual([]);
});

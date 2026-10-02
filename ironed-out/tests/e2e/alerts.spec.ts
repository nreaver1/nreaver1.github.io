import { expect, test } from '@playwright/test';
import { claimWithPhone, createOuting, signUp, uniquePhone } from './helpers';

const CRON = { Authorization: 'Bearer e2e-cron-secret-0123456789' };

test('organizer verifies a phone, sets alerts, and gets a (demo) text when a friend joins', async ({
  page,
  browser,
  request,
}) => {
  await signUp(page, 'Mike Golfer');
  await page.getByRole('link', { name: 'Alerts' }).click();
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();

  // Verify a number (demo mode shows the code).
  await page.getByRole('button', { name: 'Add number' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Mobile number').fill(uniquePhone());
  await sheet.getByRole('button', { name: 'Text me a code' }).click();
  const code = (await sheet.locator('[role="note"] .display').textContent())?.trim() ?? '';
  await sheet.getByLabel('Code').fill(code);
  await sheet.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Verified')).toBeVisible();

  // Turn quiet hours off so the test works at any time of day; switch email off for joins.
  const quiet = page.getByRole('switch', { name: 'Quiet hours' });
  await expect(quiet).toHaveAttribute('aria-checked', 'true');
  await quiet.click();
  await expect(quiet).toHaveAttribute('aria-checked', 'false');
  const joinRow = page.getByRole('group', { name: 'Someone grabs a spot' });
  await expect(joinRow.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true');

  // The settings stick.
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Quiet hours' })).toHaveAttribute('aria-checked', 'false');

  // A friend joins.
  const { invitePath } = await createOuting(page);
  const friend = await (await browser.newContext()).newPage();
  await friend.goto(invitePath);
  await claimWithPhone(friend, '7:50 AM', 'Chris Chipper', uniquePhone(), 1);

  // The dispatcher endpoint is locked down, then sends.
  expect((await request.get('/api/internal/dispatch')).status()).toBe(401);
  const run = await request.post('/api/internal/dispatch', { headers: CRON });
  expect(run.ok()).toBe(true);

  await page.goto('/settings/alerts');
  await expect(page.getByRole('heading', { name: 'Texts we would have sent' })).toBeVisible();
  await expect(
    page.getByText(
      /Ironed Out: Chris grabbed the 7:50 AM spot \(\+1 guest\)\. \w+ is now 3 of 12\. \[link\]/,
    ),
  ).toBeVisible();
});

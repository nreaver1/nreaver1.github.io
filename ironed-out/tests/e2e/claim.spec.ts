import { expect, test } from '@playwright/test';
import { claimWithPhone, createOuting, signUp, uniquePhone } from './helpers';

test('friend claims a spot from the link with a guest, then drops out', async ({ page, browser }) => {
  await signUp(page, 'Mike Golfer');
  const { invitePath } = await createOuting(page);
  expect(invitePath).toMatch(/^\/t\/[0-9A-Za-z]{22}$/);
  await expect(page.getByText(/\/t\/[0-9A-Za-z]{22}$/)).toBeVisible();

  // A friend opens the link on their phone: no account.
  const friend = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await friend.goto(invitePath);
  await expect(friend.getByRole('heading', { name: 'Mount Pleasant Golf Course' })).toBeVisible();
  await expect(friend.getByText('Mike G.', { exact: true })).toBeVisible(); // non-members see short names
  await expect(friend.getByText('11 of 12 spots open')).toBeVisible();

  await claimWithPhone(friend, '7:50 AM', 'Chris Chipper', uniquePhone(), 1);
  await expect(friend.getByText('You’re in for 7:50 AM, plus 1 guest.')).toBeVisible();
  await friend.getByRole('button', { name: 'Sweet' }).click();

  await expect(friend.getByText('Chris Chipper (you)')).toBeVisible();
  await expect(
    friend.getByText('Chris Chipper’s guest').or(friend.getByText("Chris Chipper's guest")),
  ).toBeVisible();
  await expect(friend.getByText('9 of 12 spots open')).toBeVisible();
  // Members see full names now.
  await expect(friend.getByText('Mike Golfer', { exact: true })).toBeVisible();

  // Calendar export.
  await friend.getByRole('button', { name: 'Add to my calendar' }).click();
  const ics = await friend.request.get(`${invitePath}/calendar`);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(await ics.text()).toContain('SUMMARY:Golf at Mount Pleasant Golf Course');
  await friend.keyboard.press('Escape');

  // The organizer sees them.
  await page.reload();
  await page.goto(page.url().replace('/share', ''));
  await expect(page.getByText('Chris Chipper', { exact: true })).toBeVisible();

  // Coming back on the same phone: the verified device skips the code. Drop out.
  await friend.reload();
  await friend.getByRole('button', { name: 'Drop out' }).click();
  await friend.getByRole('button', { name: 'Yes, drop me' }).click();
  await expect(friend.getByText('11 of 12 spots open')).toBeVisible();

  // Grab one again with no code (device remembered).
  await friend
    .getByRole('article', { name: '8:00 AM tee time' })
    .getByRole('button', { name: /Open spot.*Grab it/ })
    .first()
    .click();
  await expect(friend.getByText('Grabbing it as')).toBeVisible();
  await friend.getByRole('button', { name: 'Grab 8:00 AM' }).click();
  await expect(friend.getByText('You’re in for 8:00 AM.')).toBeVisible();
});

test('if someone grabs the spot first, the sheet offers the next one', async ({ page, browser }) => {
  await signUp(page, 'Mike Golfer');
  const { invitePath } = await createOuting(page);

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto(invitePath);
  await b.goto(invitePath); // b's page is now stale

  await claimWithPhone(a, '7:40 AM', 'Fast Freddie', uniquePhone());

  // b tries the same (first open) 7:40 spot.
  await b
    .getByRole('article', { name: '7:40 AM tee time' })
    .getByRole('button', { name: /Open spot.*Grab it/ })
    .first()
    .click();
  const sheet = b.getByRole('dialog');
  await sheet.getByLabel('Your name').fill('Slow Sam');
  await sheet.getByLabel('Mobile number').fill(uniquePhone());
  await sheet.getByRole('button', { name: 'Text me a code' }).click();
  await expect(sheet.getByRole('alert').filter({ hasText: 'Someone just grabbed that spot' })).toContainText(
    'Here’s the next open one: 7:40 AM.',
  );
  // Their details are kept, so one tap tries the next spot.
  await expect(sheet.getByLabel('Your name')).toHaveValue('Slow Sam');
  await sheet.getByRole('button', { name: 'Text me a code' }).click();
  await expect(sheet.getByRole('heading', { name: 'Check your texts' })).toBeVisible();
});

test('expired or junk links show a friendly page', async ({ page }) => {
  await page.goto('/t/notARealToken12345678');
  await expect(page.getByRole('heading', { name: 'This link has run its course' })).toBeVisible();
});

test('the link preview image renders', async ({ page, request }) => {
  await signUp(page, 'Mike Golfer');
  const { invitePath } = await createOuting(page);
  await page.goto(invitePath);
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toMatch(/\/og\?v=\d+$/);
  const res = await request.get(new URL(og!).pathname + new URL(og!).search);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
});

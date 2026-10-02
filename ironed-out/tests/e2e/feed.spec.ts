import { expect, test } from '@playwright/test';
import { claimWithPhone, createOuting, signUp, uniquePhone } from './helpers';

test('"Since you last looked" shows what changed, highlights the opened spot and offers it', async ({
  page,
  browser,
}) => {
  await signUp(page, 'Mike Golfer');
  const { id, invitePath } = await createOuting(page);

  // Pat looks at the invite but doesn't claim yet (this sets their baseline).
  const pat = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await pat.goto(invitePath);
  await expect(pat.getByText('11 of 12 spots open')).toBeVisible();
  await expect(pat.getByRole('heading', { name: 'Since you last looked' })).toHaveCount(0);
  await pat.waitForTimeout(500); // let the baseline save

  // Dave grabs 7:50 and drops out; Mike adds a tee time.
  const dave = await (await browser.newContext()).newPage();
  await dave.goto(invitePath);
  await claimWithPhone(dave, '7:50 AM', 'Dave Divot', uniquePhone());
  await dave.getByRole('button', { name: 'Sweet' }).click();
  await dave.getByRole('button', { name: 'Drop out' }).click();
  await dave.getByRole('button', { name: 'Yes, drop me' }).click();
  await expect(dave.getByText('11 of 12 spots open')).toBeVisible();

  await page.goto(`/outings/${id}`);
  await page.getByRole('button', { name: 'Add another tee time' }).click();
  await expect(page.getByRole('article', { name: '8:10 AM tee time' })).toBeVisible();

  // Pat comes back.
  await pat.reload();
  const banner = pat
    .getByRole('status')
    .filter({ has: pat.getByRole('heading', { name: 'Since you last looked' }) });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Mike added an 8:10 AM tee time.');
  await expect(banner).toContainText('Dave D. dropped out. A spot opened at 7:50 AM.');
  await expect(banner).toContainText('Dave D. grabbed 7:50 AM.');
  await expect(pat.getByText('Just opened!')).toBeVisible();
  await expect(pat.getByRole('article', { name: '8:10 AM tee time' }).getByText('new')).toBeVisible();

  // One tap grabs the newly opened spot.
  await banner.getByRole('button', { name: 'Grab the 7:50 AM spot' }).click();
  await expect(pat.getByRole('dialog').getByRole('heading', { name: 'Grab 7:50 AM' })).toBeVisible();
  await pat.keyboard.press('Escape');

  // "Got it" clears it, and it stays cleared.
  await banner.getByRole('button', { name: 'Got it' }).click();
  await expect(pat.getByRole('heading', { name: 'Since you last looked' })).toHaveCount(0);
  await pat.waitForTimeout(500);
  await pat.reload();
  await expect(pat.getByText('15 of 16 spots open')).toBeVisible();
  await expect(pat.getByRole('heading', { name: 'Since you last looked' })).toHaveCount(0);
});

test('after claiming, a quiet sheet says "You\'re in"', async ({ page, browser }) => {
  await signUp(page, 'Mike Golfer');
  const { invitePath } = await createOuting(page);
  const jen = await (await browser.newContext()).newPage();
  await jen.goto(invitePath);
  await claimWithPhone(jen, '7:40 AM', 'Jen Putts', uniquePhone());
  await jen.getByRole('button', { name: 'Sweet' }).click();
  await jen.waitForTimeout(500);
  await jen.reload();
  await expect(jen.getByText('You’re in. No changes since you joined.')).toBeVisible();
});

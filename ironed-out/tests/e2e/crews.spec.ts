import { expect, test } from '@playwright/test';
import { freshIp, PASSWORD, signUp, uniqueEmail } from './helpers';

const CRON = { Authorization: 'Bearer e2e-cron-secret-0123456789' };

test('make a crew, a friend joins from the link, and hears about the new outing', async ({
  page,
  browser,
  request,
}) => {
  await signUp(page, 'Mike Golfer');
  await page.getByRole('link', { name: 'Crew', exact: true }).click();
  await page.getByRole('link', { name: 'Make a new crew' }).click();
  await page.getByLabel('Crew name').fill('Saturday Hackers');
  await page.getByRole('button', { name: 'Make the crew' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday Hackers' })).toBeVisible();
  await expect(page.getByText('Mike · you')).toBeVisible();
  const link = (await page.getByLabel('Crew invite link').textContent())?.trim() ?? '';
  const path = link.slice(link.indexOf('/g/'));
  expect(path).toMatch(/^\/g\/[0-9A-Za-z]{22}$/);

  // Jen opens the link without an account, signs up, and lands back on the invite.
  const jen = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await freshIp(jen);
  await jen.goto(path);
  await expect(jen.getByRole('heading', { name: 'Saturday Hackers' })).toBeVisible();
  await expect(jen.getByText('Mike invited you to')).toBeVisible();
  await jen.getByRole('link', { name: 'Make an account to join' }).click();
  await jen.getByLabel('Your name').fill('Jen Putts');
  await jen.getByLabel('Email').fill(uniqueEmail('jen'));
  await jen.getByLabel('Password').fill(PASSWORD);
  await jen.getByRole('button', { name: 'Create account' }).click();
  await expect(jen).toHaveURL(new RegExp(`${path}$`));
  await jen.getByRole('button', { name: 'Join as Jen' }).click();
  await expect(jen.getByText('Jen · you')).toBeVisible();
  await expect(jen.getByText('Mike Golfer')).toBeVisible();

  // Mike starts an outing with the crew from the crew page.
  await page.reload();
  await expect(page.getByText('Jen Putts')).toBeVisible();
  await page.getByRole('link', { name: 'Start an outing with this crew' }).click();
  await expect(page.getByRole('radio', { name: 'Saturday Hackers' })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Search courses').fill('Mount Pleasant');
  await page.getByRole('option', { name: /Mount Pleasant Golf Course/ }).click();
  await page.getByRole('button', { name: 'Create & get the link' }).click();
  await expect(page.getByRole('heading', { name: 'Link’s ready!' })).toBeVisible();

  // Jen has no phone, so the alert is an email; it shows in her Alerts history.
  await request.post('/api/internal/dispatch', { headers: CRON });
  await jen.goto('/settings/alerts');
  await expect(jen.getByText(/Mike started an outing: Mount Pleasant Golf Course/)).toBeVisible();

  // Home lists the crew.
  await jen.goto('/home');
  await expect(jen.getByRole('link', { name: /Saturday Hackers/ })).toBeVisible();
});

test('invite someone by name, they show as invited, then accept from Home', async ({ page, browser }) => {
  await signUp(page, 'Mike Golfer');
  await page.goto('/crews/new');
  await page.getByLabel('Crew name').fill('Sunday Shankers');
  await page.getByRole('button', { name: 'Make the crew' }).click();
  await expect(page.getByText('Mike · you')).toBeVisible();

  // Invite by phone: demo mode says nothing went out and offers the personal link.
  await page.getByRole('button', { name: 'Invite someone by text or email' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Their name').fill('Alex Ace');
  await sheet.getByLabel('Mobile number or email').fill('(410) 555-0499');
  await sheet.getByRole('button', { name: 'Send the invite' }).click();
  await expect(sheet.getByRole('heading', { name: 'Alex is invited' })).toBeVisible();
  await expect(sheet.getByText(/Demo mode: texts aren’t hooked up yet/)).toBeVisible();
  await expect(sheet.getByLabel("Alex's invite link")).toContainText('/g/');

  // Invite by email.
  const jenEmail = uniqueEmail('jen');
  await sheet.getByRole('button', { name: 'Invite someone else' }).click();
  await sheet.getByLabel('Their name').fill('Jen Putts');
  await sheet.getByLabel('Mobile number or email').fill(jenEmail);
  await sheet.getByRole('button', { name: 'Send the invite' }).click();
  await expect(sheet.getByRole('heading', { name: 'Jen is invited' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText('Alex Ace · invited')).toBeVisible();
  await expect(page.getByText('Jen Putts · invited')).toBeVisible();
  const waiting = page.getByRole('region', { name: 'Waiting on' });
  await expect(waiting.getByText('•••-•••-0499')).toBeVisible();

  // Cancel Alex.
  await waiting.getByRole('button', { name: "Cancel Alex Ace's invite" }).click();
  await expect(page.getByText('Alex Ace · invited')).toHaveCount(0);

  // Jen signs up with the invited email and sees the invite on Home.
  const jen = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await freshIp(jen);
  await jen.goto('/signup');
  await jen.getByLabel('Your name').fill('Jen Putts');
  await jen.getByLabel('Email').fill(jenEmail);
  await jen.getByLabel('Password').fill(PASSWORD);
  await jen.getByRole('button', { name: 'Create account' }).click();
  await expect(jen.getByText(/Mike invited you to/)).toBeVisible();
  await jen.getByRole('button', { name: 'Join Sunday Shankers' }).click();
  await expect(jen.getByText('Jen · you')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Jen Putts · invited')).toHaveCount(0);
  await expect(page.getByText('Jen Putts', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Waiting on' })).toHaveCount(0);
});

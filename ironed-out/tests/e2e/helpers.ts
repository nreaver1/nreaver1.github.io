import { expect, type Page } from '@playwright/test';

let n = 0;
/** Unique email per call so tests never collide in the shared database. */
export const uniqueEmail = (who: string) => `${who}+${Date.now()}-${n++}@example.com`;

/** A unique valid US mobile number per call. */
export const uniquePhone = () => `410555${String((Date.now() + n++) % 10000).padStart(4, '0')}`;

export const PASSWORD = 'fairway-7-iron-e2e';

/**
 * Gives this browser its own client IP (the app reads X-Forwarded-For, like on Vercel), so a full
 * test run doesn't trip the per-IP sign-up limit.
 */
export async function freshIp(page: Page) {
  const r = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${r()}.${r()}.${r()}` });
}

export async function signUp(
  page: Page,
  name: string,
  email = uniqueEmail(name.split(' ')[0]!.toLowerCase()),
) {
  await freshIp(page);
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return email;
}

/**
 * Creates a 3 × 4 outing at Mount Pleasant from 7:40 AM. Ends on the share page and returns the
 * outing id and the invite path (/t/<token>).
 */
export async function createOuting(page: Page) {
  await page.goto('/outings/new');
  await page.getByLabel('Search courses').fill('Mount Pleasant');
  await page.getByRole('option', { name: /Mount Pleasant Golf Course/ }).click();
  await page.getByLabel('Cost per player (paid at the course)').fill('45');
  await page.getByLabel('Note for the crew').fill('Walking unless it rains.');
  await page.getByRole('button', { name: 'Create & get the link' }).click();
  await expect(page.getByRole('heading', { name: 'Link’s ready!' })).toBeVisible();
  const id = /\/outings\/([0-9a-f-]{36})\/share/.exec(page.url())?.[1] ?? '';
  const href = await page.getByRole('link', { name: 'See the invite page' }).getAttribute('href');
  return { id, invitePath: href ?? '' };
}

/** Claims the first open spot at `time` through the phone-code flow (demo mode shows the code). */
export async function claimWithPhone(page: Page, time: string, name: string, phone: string, guests = 0) {
  await page
    .getByRole('article', { name: `${time} tee time` })
    .getByRole('button', { name: /Open spot.*Grab it/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: `Grab ${time}` })).toBeVisible();
  await sheet.getByLabel('Your name').fill(name);
  await sheet.getByLabel('Mobile number').fill(phone);
  for (let i = 0; i < guests; i++) await sheet.getByRole('button', { name: 'One more guest' }).click();
  await sheet.getByRole('button', { name: 'Text me a code' }).click();
  await expect(sheet.getByRole('heading', { name: 'Check your texts' })).toBeVisible();
  const code =
    (
      await sheet.locator('[role="note"] .display, [role="note"] span.display').first().textContent()
    )?.trim() ?? '';
  expect(code).toMatch(/^\d{6}$/);
  await sheet.getByLabel('Code').fill(code);
  await sheet.getByRole('button', { name: 'Lock in my spot' }).click();
  await expect(sheet.getByRole('heading', { name: 'You’re in!' })).toBeVisible();
}

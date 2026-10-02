import { expect, type Page } from '@playwright/test';

let n = 0;
/** Unique email per call so tests never collide in the shared database. */
export const uniqueEmail = (who: string) => `${who}+${Date.now()}-${n++}@example.com`;

export const PASSWORD = 'fairway-7-iron-e2e';

export async function signUp(
  page: Page,
  name: string,
  email = uniqueEmail(name.split(' ')[0]!.toLowerCase()),
) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return email;
}

/** Creates a 3 × 4 outing at Mount Pleasant from 7:40 AM and returns its id. */
export async function createOuting(page: Page) {
  await page.goto('/outings/new');
  await page.getByLabel('Search courses').fill('Mount Pleasant');
  await page.getByRole('option', { name: /Mount Pleasant Golf Course/ }).click();
  await page.getByLabel('Cost per player (paid at the course)').fill('45');
  await page.getByLabel('Note for the crew').fill('Walking unless it rains.');
  await page.getByRole('button', { name: 'Create & get the link' }).click();
  await expect(page.getByRole('heading', { name: 'Mount Pleasant Golf Course' })).toBeVisible();
  return /\/outings\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
}

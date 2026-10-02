import { expect, test } from '@playwright/test';
import { freshIp } from './helpers';

const email = `mike+${Date.now()}@example.com`;
const password = 'fairway-7-iron-e2e';

test('sign up, log out, log in', async ({ page }) => {
  await freshIp(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Make an account' })).toBeVisible();

  await page.getByLabel('Your name').fill('Mike Golfer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mike');

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/home');
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'match' })).toHaveText(
    "That email and password don't match.",
  );

  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('sign-up shows field errors next to the right input', async ({ page }) => {
  await freshIp(page);
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Jen');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Your name')).toHaveValue('Jen');
});

test('password reset through the dev outbox', async ({ page }) => {
  await freshIp(page);
  const resetEmail = `jen+${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Jen');
  await page.getByLabel('Email').fill(resetEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/forgot');
  await page.getByLabel('Email').fill(resetEmail);
  await page.getByRole('button', { name: 'Email me a reset link' }).click();
  await expect(page.getByRole('status')).toContainText('reset link is on its way');

  await page.goto('/dev/outbox');
  const text = await page.locator('pre').first().textContent();
  const link = /https?:\/\/\S+\/reset\?token=\w+/.exec(text ?? '')?.[0];
  expect(link).toBeDefined();

  await page.goto(link!);
  await page.getByLabel('New password').fill('brand-new-putter-3');
  await page.getByRole('button', { name: 'Save and log in' }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The link only works once.
  await page.goto(link!);
  await page.getByLabel('New password').fill('another-new-one-4');
  await page.getByRole('button', { name: 'Save and log in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'expired' })).toBeVisible();
});

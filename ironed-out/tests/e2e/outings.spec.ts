import { expect, test } from '@playwright/test';
import { createOuting, signUp } from './helpers';

test('organizer creates an outing and manages the tee sheet', async ({ page }) => {
  await signUp(page, 'Mike Golfer');
  await page.getByRole('link', { name: 'New outing' }).click();

  // Live preview follows the steppers; one tee time to start.
  await expect(page.getByText('7:40 AM', { exact: true })).toBeVisible();
  await expect(page.getByText('4 spots to fill')).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'More tee times' }).click();
  await expect(page.getByText('7:40 · 7:50 · 8:00 AM')).toBeVisible();
  await expect(page.getByText('12 spots to fill')).toBeVisible();

  // The first tee time can be typed/picked as well as stepped.
  await page.getByLabel('First tee time').fill('09:05');
  await expect(page.getByText('9:05 · 9:15 · 9:25 AM')).toBeVisible();
  await page.getByRole('button', { name: 'Earlier' }).click();
  await expect(page.getByText('8:55 · 9:05 · 9:15 AM')).toBeVisible();
  await page.getByLabel('First tee time').fill('07:40');

  // Scope toggle: Pebble Beach only shows up under "All courses".
  await page.getByLabel('Search courses').fill('pebble');
  await expect(page.getByText('No courses match.')).toBeVisible();
  await page.getByRole('radio', { name: 'All courses' }).click();
  await expect(page.getByRole('option', { name: /Pebble Beach/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Within 2 hrs of Baltimore' }).click();

  const { id } = await createOuting(page);
  await page.goto(`/outings/${id}`);
  await expect(page.getByText('11 of 12 spots open')).toBeVisible();
  await expect(page.getByText('Mike Golfer (you)')).toBeVisible();
  await expect(page.getByText('$45 / player · pay at the course')).toBeVisible();

  // Capacity, tee times, lock.
  await page.getByRole('button', { name: 'Add a spot to 7:50 AM' }).click();
  await expect(page.getByText('12 of 13 spots open')).toBeVisible();
  await page.getByRole('button', { name: 'Delete the 8:00 AM tee time' }).click();
  await expect(page.getByRole('article', { name: '8:00 AM tee time' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add another tee time' }).click();
  await expect(page.getByRole('article', { name: '8:00 AM tee time' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete the 7:40 AM tee time' })).toBeDisabled();

  await page.getByRole('button', { name: 'Lock it in' }).click();
  await expect(page.getByText('Locked in', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add another tee time' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock the outing' }).click();
  await expect(page.getByRole('button', { name: 'Add another tee time' })).toBeVisible();

  // Home shows it as next up.
  await page.goto('/home');
  await expect(page.getByText('NEXT UP')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mount Pleasant Golf Course' })).toBeVisible();

  // The organizer can delete it; it's gone from Home.
  await page.goto(`/outings/${id}`);
  await page.getByRole('button', { name: 'Delete this outing' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Mount Pleasant Golf Course' })).toHaveCount(0);
});

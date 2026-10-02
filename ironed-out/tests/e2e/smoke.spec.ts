import { expect, test } from '@playwright/test';

test('health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/v1/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('welcome page fits a 360px phone with real tap targets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ironed');
  await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  for (const link of await page.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('sheet traps focus, closes on Escape and returns focus', async ({ page }) => {
  await page.goto('/styleguide');
  const opener = page.getByRole('button', { name: 'Open the claim sheet' });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Grab 7:50 AM' });
  await expect(dialog).toBeVisible();
  // Tabbing never lands on the page behind the modal (it is inert). Chrome may move focus out to
  // the browser UI after the last control, which leaves document.activeElement on <body>.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const escaped = await dialog.evaluate((d) => {
      const el = document.activeElement;
      return !!el && el !== document.body && !d.contains(el);
    });
    expect(escaped).toBe(false);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

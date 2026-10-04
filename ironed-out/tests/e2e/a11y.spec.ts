import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createOuting, freshIp, signUp } from './helpers';

/** Accessibility pass (SPEC §10 M9): axe's WCAG 2.1 A/AA rules on every main screen. */

async function scan(page: Page, label: string) {
  // Let entrance animations finish (not the looping ones), or axe measures half-faded colors.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = violations.map(
    (v) =>
      `${label}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes
        .map(
          (n) => `${n.target.join(' ')} [${n.failureSummary?.replace(/\s+/g, ' ')}] ${n.html.slice(0, 120)}`,
        )
        .join(' | ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

test('public pages', async ({ page }) => {
  for (const path of ['/', '/login', '/signup', '/forgot', '/developers']) {
    await page.goto(path);
    await scan(page, path);
  }
});

test('organizer and invitee screens', async ({ page, browser }) => {
  await signUp(page, 'Ada Access');
  await scan(page, '/home (empty)');
  await page.goto('/outings/new');
  await scan(page, '/outings/new');
  const { id, invitePath } = await createOuting(page);
  await scan(page, 'share');
  await page.goto(`/outings/${id}`);
  await scan(page, 'organizer tee sheet');
  await page.goto('/home');
  await scan(page, '/home');
  for (const path of ['/settings/alerts', '/settings/account', '/crews', '/crews/new']) {
    await page.goto(path);
    await scan(page, path);
  }

  const friend = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await freshIp(friend);
  await friend.goto(invitePath);
  await scan(friend, 'invite page');
  await friend
    .getByRole('article', { name: '7:50 AM tee time' })
    .getByRole('button', { name: /Open spot.*Grab it/ })
    .first()
    .click();
  await expect(friend.getByRole('dialog')).toBeVisible();
  await scan(friend, 'claim sheet');
});

/** Public pages, responsive navigation and protected-route redirects. */
import { expect, test } from '@playwright/test';

test('landing page links to discovery and sign-in', async ({ page }) => {
  await page.goto('/en-GB');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Fund the technology founders',
  );
  await page.getByTestId('home-discover').click();
  await expect(page).toHaveURL(/\/discover/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Discover technology startups' }),
  ).toBeVisible();
});

test('discovery filters update the URL and results', async ({ page }) => {
  await page.goto('/en-GB/discover');
  await page.getByLabel('Sector').selectOption('clean_energy');
  await expect(page).toHaveURL(/sector=clean_energy/);
  const cards = page.getByTestId('startup-card');
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allInnerTexts()) expect(text).toContain('Clean energy');
  await page.getByLabel('Sector').selectOption('space_tech');
  await expect(page.getByTestId('empty-state')).toBeVisible();
});

test('protected pages redirect anonymous visitors to sign-in', async ({ page }) => {
  await page.goto('/en-GB/app/deals');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByTestId('google-sign-in')).toBeVisible();
});

test('a cancelled Google sign-in shows a clear message', async ({ page }) => {
  await page.goto('/en-GB/login?error=cancelled');
  await expect(page.getByTestId('login-error')).toContainText('cancelled');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('navigation collapses into a menu and cards stack', async ({ page }) => {
    await page.goto('/en-GB/discover');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'How it works' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    const box = await page.getByTestId('startup-card').first().boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(330);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});

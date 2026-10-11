import { expect, type Browser, type Page } from '@playwright/test';

export const MOCK_GOOGLE = 'http://localhost:4020';

/** Registers users in the mock Google provider (synthetic identities only). */
export async function seedGoogleUsers(users: { email: string; name: string }[]): Promise<void> {
  const response = await fetch(`${MOCK_GOOGLE}/__seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users }),
  });
  expect(response.ok).toBe(true);
}

/** Signs in through the real OAuth redirect flow, choosing the account with `login_hint`. */
export async function signIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/en-GB/login');
  await page.getByTestId('login-hint').fill(email);
  await page.getByTestId('google-sign-in').click();
  await page.waitForURL(/\/(onboarding|app)/);
  return page;
}

export const runId = Date.now().toString(36);

/** Toasts are also announced in a Radix live region, so match the visible title only. */
export async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}

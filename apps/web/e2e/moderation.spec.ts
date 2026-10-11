/**
 * Moderation: a supporter reports a listing, an administrator (provisioned with the operator
 * command, never self-assigned) reviews and resolves it; non-admins cannot open admin pages.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { expectToast, runId, seedGoogleUsers, signIn } from './helpers';

const adminEmail = `e2e-admin-${runId}@example.test`;
const reporterEmail = `e2e-reporter-${runId}@example.test`;
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

test('a reported listing is reviewed and resolved by an administrator', async ({ browser }) => {
  await seedGoogleUsers([
    { email: adminEmail, name: 'Ada Admin' },
    { email: reporterEmail, name: 'Rae Reporter' },
  ]);
  // Operator command: the only way to grant admin (links on first Google sign-in).
  execFileSync(
    'pnpm',
    ['--filter', '@investfund/api', 'admin:grant', '--', '--email', adminEmail],
    {
      cwd: REPO,
      stdio: 'pipe',
      env: {
        ...process.env,
        ...(process.env.DATABASE_URL
          ? {}
          : { DATABASE_URL: 'postgresql://investfund:investfund@localhost:5432/investfund' }),
        JWT_ACCESS_SECRET: 'x',
        JWT_REFRESH_SECRET: 'x',
        IP_HASH_SECRET: 'x',
        ENCRYPTION_KEY: 'ZGV2LW9ubHkta2V5LW5vdC1mb3ItcHJvZHVjdGlvbiE=',
      },
    },
  );

  const reporter = await signIn(browser, reporterEmail);
  await reporter.getByTestId('role-supporter').click();
  await reporter.getByTestId('confirm-role').click();
  await reporter.getByLabel('Display name').fill('Rae Reporter');
  await reporter.getByTestId('save-supporter-profile').click();
  await reporter.waitForURL(/\/app\/recommended/);

  // Non-admins see a forbidden state on admin pages (the API refuses too).
  await reporter.goto('/en-GB/app/admin');
  await expect(reporter.getByText('Not available for your account')).toBeVisible();

  await reporter.goto('/en-GB/discover');
  const firstCard = reporter.getByTestId('startup-card').first();
  const listingName = (await firstCard.getByRole('heading').innerText()).trim();
  await firstCard.getByRole('link', { name: listingName }).click();
  await reporter.getByTestId('report-open').click();
  await reporter.getByLabel('Reason').selectOption('misleading_information');
  await reporter.getByLabel('Details (optional)').fill(`E2E report ${runId}`);
  await reporter.getByRole('button', { name: 'Submit report' }).click();
  await expectToast(reporter, 'Report submitted');

  const admin = await signIn(browser, adminEmail);
  await admin.waitForURL(/\/app\/admin/);
  await expect(admin.getByTestId('overview-reports')).toBeVisible();
  await admin.goto('/en-GB/app/admin/reports');
  await admin.getByTestId('report-row').filter({ hasText: listingName }).first().click();
  await expect(admin.getByText(`E2E report ${runId}`)).toBeVisible();
  await admin.getByTestId('report-action').selectOption('warning_recorded');
  await admin.getByTestId('resolve-report').click();
  await expectToast(admin, 'Report reviewed');
  await expect(admin.locator('[data-status="resolved"]').first()).toBeVisible();

  // The reporter is notified that the report was reviewed.
  await reporter.goto('/en-GB/app/notifications');
  await expect(reporter.getByTestId('notification').first()).toContainText(
    'A report you submitted was reviewed',
  );
});

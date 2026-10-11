/**
 * The primary journey (master brief §23): founder publishes → supporter discovers and connects →
 * founder accepts → real-time chat → proposal → counteroffer → acceptance → funding reported →
 * receipt confirmed → completed; and an unrelated user cannot access any of it.
 */
import { expect, test, type Page } from '@playwright/test';

import { expectToast, runId, seedGoogleUsers, signIn } from './helpers';

const founderEmail = `e2e-founder-${runId}@example.test`;
const supporterEmail = `e2e-supporter-${runId}@example.test`;
const outsiderEmail = `e2e-outsider-${runId}@example.test`;
const startupName = `E2E Solar ${runId}`;

test.describe.configure({ mode: 'serial' });

let founder: Page;
let supporter: Page;
let startupPath = '';
let conversationUrl = '';
let dealUrl = '';

test.beforeAll(async () => {
  await seedGoogleUsers([
    { email: founderEmail, name: 'Erin Founder' },
    { email: supporterEmail, name: 'Sol Supporter' },
    { email: outsiderEmail, name: 'Otto Outsider' },
  ]);
});

test('1-5. founder signs in, completes a profile, creates, completes and publishes a startup', async ({
  browser,
}) => {
  founder = await signIn(browser, founderEmail);
  await expect(founder.getByTestId('onboarding')).toBeVisible();
  await founder.getByTestId('role-founder').click();
  await founder.getByTestId('confirm-role').click();
  await founder.getByLabel('Display name').fill('Erin Founder');
  await founder.getByLabel('Headline').fill('Engineer building solar kits');
  await founder.getByTestId('save-founder-profile').click();

  await founder.waitForURL(/\/app\/startups\/new/);
  await founder.getByTestId('new-startup-name').fill(startupName);
  await founder.getByTestId('create-startup').click();
  await founder.waitForURL(/\/app\/startups\/[0-9a-f-]{36}$/);

  // Publishing is blocked until required fields and a milestone exist.
  await expect(founder.getByTestId('publication-issues')).toBeVisible();
  await expect(founder.getByTestId('publish-startup')).toBeDisabled();

  await founder.getByLabel('Tagline').fill('Solar kits for rural schools');
  await founder.getByLabel('Description').fill('We build plug-and-play solar kits for schools.');
  await founder.getByLabel('Technology sector').selectOption('clean_energy');
  await founder.getByLabel('Stage').selectOption('prototype');
  await founder.getByLabel('Country or target market').selectOption('GB');
  await founder.getByTestId('purpose-equipment').click();
  // Range rule feedback: target above the maximum.
  await founder.getByTestId('amount-minAmountMinor').fill('10000');
  await founder.getByTestId('amount-targetAmountMinor').fill('90000');
  await founder.getByTestId('amount-maxAmountMinor').fill('60000');
  await expect(founder.getByText('The target must not exceed the maximum.')).toBeVisible();
  await expect(founder.getByTestId('save-details')).toBeDisabled();
  await founder.getByTestId('amount-targetAmountMinor').fill('40000');
  await founder.getByTestId('save-details').click();
  await expectToast(founder, 'Changes saved');

  await founder.getByTestId('tab-milestones').click();
  await founder.getByTestId('add-milestone').click();
  const row = founder.getByTestId('milestone-row');
  await row.getByLabel('Title').fill('Pilot in three schools');
  await row.getByLabel('What will be achieved').fill('Install and monitor kits for a term.');
  await row.getByLabel(/Amount/).fill('25000');
  await founder.getByTestId('save-milestones').click();
  await expectToast(founder, 'Milestones saved');

  await expect(founder.getByTestId('publish-startup')).toBeEnabled();
  await founder.getByTestId('publish-startup').click();
  await expect(
    founder.getByTestId('publish-panel').getByText('Published', { exact: true }),
  ).toBeVisible();
  const href = await founder.getByRole('link', { name: 'View public page' }).getAttribute('href');
  startupPath = (href ?? '').replace(/^\/en-GB/, '');
  expect(startupPath).toMatch(/\/startups\//);
});

test('6-9. supporter sets preferences, gets an explained recommendation and requests a connection', async ({
  browser,
}) => {
  supporter = await signIn(browser, supporterEmail);
  await supporter.getByTestId('role-supporter').click();
  await supporter.getByTestId('confirm-role').click();
  await supporter.getByLabel('Display name').fill('Sol Supporter');
  await supporter.getByTestId('sector-clean_energy').click();
  await supporter.getByTestId('stage-prototype').click();
  await supporter.getByLabel('Minimum').fill('5000');
  await supporter.getByLabel('Maximum').fill('50000');
  await supporter.getByTestId('save-supporter-profile').click();

  await supporter.waitForURL(/\/app\/recommended/);
  const card = supporter
    .getByTestId('recommendations')
    .getByTestId('startup-card')
    .filter({ hasText: startupName });
  await expect(card).toBeVisible();
  await expect(card).toContainText(
    'Recommended because this startup operates in your preferred sector',
  );

  await card.getByRole('link', { name: startupName }).click();
  await expect(supporter.getByRole('heading', { level: 1, name: startupName })).toBeVisible();
  await supporter.getByTestId('request-connection').click();
  await supporter.getByLabel('Message (optional)').fill('I fund school energy projects.');
  await supporter.getByTestId('send-connection-request').click();
  await expectToast(supporter, 'Request sent');
  await expect(supporter.getByTestId('startup-actions')).toContainText('Pending');
});

test('10-12. founder accepts; a private conversation opens and messages arrive in real time', async () => {
  await founder.goto('/en-GB/app/connections');
  const request = founder.getByTestId('connection-row').filter({ hasText: 'Sol Supporter' });
  await expect(request).toContainText('I fund school energy projects.');
  await request.getByTestId('accept-connection').click();
  await expectToast(founder, 'Connection accepted');
  await request.getByRole('link', { name: 'Open chat' }).click();
  await founder.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
  conversationUrl = founder.url();

  await supporter.goto(conversationUrl);
  await supporter.getByTestId('chat-input').fill('Hi Erin, what would the pilot cost?');
  await supporter.getByTestId('chat-send').click();

  // Delivered to the founder without a reload (SSE).
  await expect(founder.getByTestId('message-list')).toContainText('what would the pilot cost?');
  await founder.getByTestId('chat-input').fill('About £25,000 for three schools.');
  await founder.keyboard.press('Enter');
  await expect(supporter.getByTestId('message-list')).toContainText(
    'About £25,000 for three schools.',
  );
});

test('13-15. supporter proposes a grant, founder counters, supporter accepts', async () => {
  await supporter.getByTestId('chat-deals').click();
  await supporter.getByTestId('new-proposal').click();
  await supporter.getByTestId('proposal-connection').selectOption({ index: 1 });
  await supporter.getByTestId('offer-amount').fill('20000');
  await supporter.getByTestId('offer-purpose').fill('Pilot hardware');
  await supporter.getByTestId('submit-offer').click();
  await supporter.waitForURL(/\/app\/deals\/[0-9a-f-]{36}$/);
  dealUrl = supporter.url();
  await expect(supporter.getByTestId('offer-actions').getByTestId('offer-withdraw')).toBeVisible();

  await founder.goto(dealUrl);
  await founder.getByTestId('offer-counter').click();
  await founder.getByTestId('offer-amount').fill('25000');
  await founder.getByTestId('submit-offer').click();
  await expectToast(founder, 'Counteroffer sent');

  // The supporter's open page updates in real time.
  await expect(supporter.getByTestId('offer-accept')).toBeVisible();
  await supporter.getByTestId('offer-accept').click();
  await supporter.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expectToast(supporter, 'Proposal accepted');
  await expect(supporter.getByTestId('deal-actions')).toBeVisible();
});

test('16-19. funding is reported, receipt confirmed, and both see the same history', async () => {
  await supporter.getByTestId('deal-report_funding').click();
  await supporter
    .getByRole('dialog')
    .getByRole('button', { name: 'I have sent the funds' })
    .click();
  await expectToast(supporter, 'Funding reported');

  await founder.goto(dealUrl);
  await founder.getByTestId('deal-confirm_receipt').click();
  await founder.getByRole('dialog').getByRole('button', { name: 'Confirm funds received' }).click();
  await expectToast(founder, 'Receipt confirmed. The outcome is complete.');

  for (const page of [founder, supporter]) {
    await page.goto(dealUrl);
    await expect(page.getByTestId('deal-timeline')).toContainText('confirmed receipt');
    const history = page.getByTestId('offer-history').getByTestId('offer-card');
    await expect(history).toHaveCount(2);
    await expect(history.first()).toHaveAttribute('data-status', 'accepted');
    await expect(history.nth(1)).toHaveAttribute('data-status', 'countered');
    await expect(page.locator('[data-status="completed"]').first()).toBeVisible();
  }
  // Reported funding appears on the public page, labelled as reported.
  await supporter.goto(`/en-GB${startupPath}`);
  await expect(supporter.getByText(/£25,000 reported/)).toBeVisible();
});

test('20. an unrelated user cannot access the conversation, deal or documents', async ({
  browser,
}) => {
  // The founder shares a document with all connections.
  await founder.goto('/en-GB/app/startups');
  await founder.getByRole('link', { name: startupName }).click();
  await founder.getByTestId('tab-documents').click();
  await founder.getByTestId('document-input').setInputFiles({
    name: 'budget.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Pilot budget: hardware, installation, monitoring.'),
  });
  await expect(founder.getByTestId('document-row')).toContainText('budget.txt');
  await supporter.goto(`/en-GB${startupPath}`);
  await expect(supporter.getByTestId('shared-documents')).toContainText('budget.txt');

  const outsider = await signIn(browser, outsiderEmail);
  await outsider.getByTestId('role-supporter').click();
  await outsider.getByTestId('confirm-role').click();
  await outsider.getByLabel('Display name').fill('Otto Outsider');
  await outsider.getByTestId('save-supporter-profile').click();
  await outsider.waitForURL(/\/app\/recommended/);

  await outsider.goto(conversationUrl);
  await expect(outsider.getByTestId('query-error')).toContainText('could not find');
  await outsider.goto(dealUrl);
  await expect(outsider.getByTestId('query-error')).toContainText('could not find');
  await outsider.goto(`/en-GB${startupPath}`);
  await expect(outsider.getByTestId('shared-documents')).toHaveCount(0);
  // Direct API access is refused too (404, not 403: no existence leak).
  const status = await outsider.evaluate(async (url) => {
    const refresh = await fetch('http://localhost:4000/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    const id = url.split('/').pop() ?? '';
    const res = await fetch(`http://localhost:4000/api/v1/deals/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.status;
  }, dealUrl);
  expect(status).toBe(404);
});

import { expect, test, type Page } from '@playwright/test';

// Live test against the configured Supabase project. Needs two confirmed accounts:
// E2E_ONLINE=1 E2E_DEAN_EMAIL=... E2E_RA_EMAIL=... E2E_PASSWORD=... npx playwright test e2e/online.spec.ts
test.skip(!process.env.E2E_ONLINE, 'set E2E_ONLINE=1 with account credentials');
test.setTimeout(240_000);

const PASSWORD = process.env.E2E_PASSWORD ?? '';

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
}
async function signIn(page: Page, email: string) {
  await page.goto('/#/account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('dean creates the dorm online, RA joins, is activated, checks, and is removed', async ({ browser }) => {
  const deanCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const raCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const dean = await deanCtx.newPage();
  const ra = await raCtx.newPage();
  dean.on('dialog', (d) => void d.accept());
  ra.on('dialog', (d) => void d.accept());

  // Dean: sign in, create the dorm online, run setup.
  await signIn(dean, process.env.E2E_DEAN_EMAIL!);
  await expect(dean.getByRole('heading', { name: 'Join your dorm' })).toBeVisible({ timeout: 30_000 });
  await dean.getByRole('button', { name: /I am a dean/ }).click();
  await dean.getByLabel('Dorm name').fill('E2E Hall');
  await dean.getByRole('button', { name: 'Create the dorm' }).click();
  await expect(dean.getByRole('heading', { name: 'Dorm', exact: true })).toBeVisible({ timeout: 30_000 });
  await dean.getByRole('button', { name: /Next: First dean/ }).click();
  await expect(dean.getByLabel("Dean's name")).toHaveValue('Dean Sutton');
  await dean.getByRole('button', { name: /Next: Floors/ }).click();
  await dean.getByRole('button', { name: 'Fewer floors' }).click();
  await dean.getByRole('button', { name: 'Fewer floors' }).click();
  await dean.getByRole('button', { name: /Next: Finish/ }).click();
  await dean.getByRole('button', { name: 'Finish setup' }).click();
  await expect(dean.getByRole('heading', { name: 'Boys' })).toBeVisible({ timeout: 30_000 });
  await dean.getByRole('link', { name: /Import the roster/ }).click();
  await dean.getByLabel('Roster').fill('Daniel Achebe\t9\t101\nJonah Bell\t9\t102');
  await dean.getByRole('button', { name: /Import 2/ }).click();
  await expect(dean.getByRole('link', { name: /Daniel Achebe/ })).toBeVisible();

  // Dean: read the join code.
  await tab(dean, 'Settings').click();
  await dean.getByRole('link', { name: /Online sync/ }).click();
  const code = (await dean.locator('.mono', { hasText: /^[A-Z2-9]{6}$/ }).first().textContent({ timeout: 30_000 }))!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // RA: sign in, ask to join.
  await signIn(ra, process.env.E2E_RA_EMAIL!);
  await expect(ra.getByRole('heading', { name: 'Join your dorm' })).toBeVisible({ timeout: 30_000 });
  await ra.getByLabel('Join code').fill(code);
  await ra.getByRole('button', { name: 'Ask to join' }).click();
  await expect(ra.getByRole('heading', { name: 'Waiting for a dean' })).toBeVisible({ timeout: 30_000 });

  // Dean: approve as RA on Floor 1.
  await expect(dean.getByRole('button', { name: 'Approve' })).toBeVisible({ timeout: 60_000 });
  await dean.getByRole('button', { name: 'Approve' }).click();
  await dean.getByRole('switch', { name: 'Floor 1' }).click();
  // The dean must confirm the phone by its fingerprint; without this it gets no key.
  await dean.getByRole('switch', { name: /^Device/ }).click();
  await dean.getByRole('button', { name: 'Activate' }).click();
  await expect(dean.getByText(/Alex Reid is in/)).toBeVisible({ timeout: 30_000 });

  // RA: lands on home with tonight's check, does it.
  await expect(ra.getByRole('heading', { name: 'Tonight' })).toBeVisible({ timeout: 90_000 });
  await expect(ra.getByRole('button', { name: 'Start check' })).toBeVisible({ timeout: 60_000 });
  await ra.getByRole('button', { name: 'Start check' }).click();
  await ra.getByRole('button', { name: /Daniel Achebe: Present/ }).click();
  await ra.getByRole('button', { name: 'Submit check' }).click();
  await expect(ra.getByText('Submitted', { exact: true })).toBeVisible();

  // Dean: sees the result arrive.
  await tab(dean, 'Home').click();
  await expect(dean.getByText(/1 of 1 floor checks in · 1 absent/)).toBeVisible({ timeout: 90_000 });
  await expect(dean.getByRole('link', { name: /Daniel Achebe/ })).toBeVisible();

  // Dean: remove the RA; their phone loses access.
  await tab(dean, 'Settings').click();
  await dean.getByRole('link', { name: /Online sync/ }).click();
  await dean.getByRole('button', { name: 'Remove' }).click();
  await expect(dean.getByText(/Removed and key rotated/)).toBeVisible({ timeout: 60_000 });
  await expect(ra.getByRole('heading', { name: /removed from this dorm/ })).toBeVisible({ timeout: 90_000 });

  await deanCtx.close();
  await raCtx.close();
});

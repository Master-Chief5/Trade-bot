import { expect, test, type Page } from '@playwright/test';

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
}

async function enterPin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
}

test('deans set up the dorm, RAs do a check, the dean sees it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dorm' })).toBeVisible();
  await page.getByLabel('Dorm name').fill('Ryan Hall');
  await page.getByRole('button', { name: /Next: First dean/ }).click();
  await page.getByLabel("Dean's name").fill('Dean Sutton');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Confirm PIN').fill('1234');
  await page.getByRole('button', { name: /Next: Floors/ }).click();
  await page.getByRole('button', { name: 'Fewer floors' }).click();
  await page.getByRole('button', { name: /Next: Finish/ }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page.getByRole('heading', { name: 'Boys' })).toBeVisible();
  await page.getByRole('link', { name: /Import the roster/ }).click();
  await page.getByLabel('Roster').fill('Daniel Achebe\t9\t101\nJonah Bell\t9\t101\nMicah Brooks\t10\t102');
  await page.getByRole('button', { name: /Import 3/ }).click();
  await expect(page.getByRole('link', { name: /Daniel Achebe/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Micah Brooks/ })).toBeVisible();

  await tab(page, 'Settings').click();
  await page.getByRole('link', { name: /^Staff/ }).click();
  await page.getByRole('link', { name: 'Add staff' }).click();
  await page.getByLabel('Name').fill('Alex Reid');
  await page.getByLabel('PIN', { exact: true }).fill('2468');
  await page.getByRole('switch', { name: 'Floor 1' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: /Alex Reid/ })).toBeVisible();

  await tab(page, 'Settings').click();
  await page.getByRole('link', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.getByRole('button', { name: /Alex Reid/ }).click();
  await enterPin(page, '2468');
  await expect(page.getByRole('heading', { name: 'Tonight' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evening check' })).toBeVisible();
  await page.getByRole('button', { name: 'Start check' }).click();
  await expect(page.getByText('Room 101')).toBeVisible();
  await page.getByRole('button', { name: /Daniel Achebe: Present/ }).click();
  await expect(page.getByRole('button', { name: /Daniel Achebe: Absent/ })).toBeVisible();
  await page.getByRole('button', { name: 'Submit check' }).click();
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start check' })).toHaveCount(0);

  await tab(page, 'Settings').click();
  await expect(page.getByRole('link', { name: /Status types/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /Dean Sutton/ }).click();
  await enterPin(page, '1234');
  await expect(page.getByText(/1 of \d floor checks in · 1 absent/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Daniel Achebe/ })).toBeVisible();
  await tab(page, 'Print').click();
  await expect(page.getByRole('button', { name: 'Open' }).first()).toBeEnabled();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Print' })).toBeVisible();
  await tab(page, 'Home').click();
  await expect(page.getByRole('heading', { name: 'Tonight' })).toBeVisible();
  await expect(page.getByText(/1 of \d floor checks in · 1 absent/)).toBeVisible();
});

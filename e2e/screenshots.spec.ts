import { expect, test, type Page } from '@playwright/test';

// Visual pass used during development: SCREENSHOTS=1 SHOT_DIR=/tmp/shots npx playwright test e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to capture screens');
const dir = process.env.SHOT_DIR || 'test-results/shots';

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
}
async function enterPin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}

test('capture screens', async ({ page }) => {
  await page.goto('/');
  // With an online service configured the first screen offers accounts; this test uses the
  // device-only path. Wait for whichever screen the build lands on before deciding.
  const local = page.getByRole('link', { name: /Set up on this device only/ });
  const dorm = page.getByRole('heading', { name: 'Dorm', exact: true });
  await expect(local.or(dorm)).toBeVisible();
  if (await local.isVisible()) await local.click();
  await shot(page, '01-setup-light');
  await page.getByLabel('Dorm name').fill('Ryan Hall');
  await page.getByRole('button', { name: /Next: First dean/ }).click();
  await page.getByLabel("Dean's name").fill('Dean Sutton');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Confirm PIN').fill('1234');
  await page.getByRole('button', { name: /Next: Floors/ }).click();
  await shot(page, '02-setup-floors');
  await page.getByRole('button', { name: /Next: Finish/ }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.getByRole('link', { name: /Import the roster/ }).click();
  await page.getByLabel('Roster').fill(['Daniel Achebe\t9\t101', 'Jonah Bell\t9\t101', 'Micah Brooks\t10\t102', 'Levi Stone\t10\t102', 'Caleb Moore\t10\t103', 'Samuel Reyes\t11\t104', 'Noah Park\t9\t104', 'Ethan Ross\t11\t105', 'Aaron Kim\t11\t105', 'Ben Tran\t10\t106', 'Owen Diaz\t12\t201', 'Eli James\t12\t202'].join('\n'));
  await shot(page, '03-import-preview');
  await page.getByRole('button', { name: /Import 12/ }).click();
  await shot(page, '04-boys');
  await tab(page, 'Settings').click();
  await page.getByRole('link', { name: /^Staff/ }).click();
  await page.getByRole('link', { name: 'Add staff' }).click();
  await page.getByLabel('Name').fill('Alex Reid');
  await page.getByLabel('PIN', { exact: true }).fill('2468');
  await page.getByRole('switch', { name: 'Floor 1' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await tab(page, 'Settings').click();
  await page.getByRole('link', { name: /Leave board/ }).click();
  await page.getByRole('button', { name: 'Sign a boy out' }).click();
  await page.getByLabel('Boy', { exact: true }).selectOption({ index: 5 });
  await page.getByLabel('Reason').fill('Home for the weekend');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await shot(page, '05-leave-board');
  await tab(page, 'Home').click();
  await shot(page, '06-dean-tonight-empty');
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /Alex Reid/ }).click();
  await shot(page, '07-pin');
  await enterPin(page, '2468');
  await shot(page, '08-ra-home');
  await page.getByRole('button', { name: 'Start check' }).click();
  await page.getByRole('button', { name: /Daniel Achebe: Present/ }).click();
  await page.getByRole('button', { name: /Levi Stone: Present/ }).click();
  await page.getByRole('button', { name: /Levi Stone: Absent/ }).click();
  await page.getByRole('button', { name: /^Samuel Reyes Grade/ }).click();
  await shot(page, '09-note-sheet');
  await page.getByLabel('Note').fill('In shower, confirmed');
  await page.getByRole('button', { name: 'Save' }).click();
  await shot(page, '10-check-light');
  await page.evaluate(() => { localStorage.setItem('rh-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
  await shot(page, '11-check-dark');
  await page.getByRole('button', { name: 'Submit check' }).click();
  await shot(page, '12-ra-home-dark');
  await tab(page, 'Floors').click();
  await shot(page, '13-floors-dark');
  await tab(page, 'Print').click();
  await shot(page, '14-print-dark');
  await tab(page, 'Settings').click();
  await shot(page, '15-ra-settings-dark');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /Dean Sutton/ }).click();
  await enterPin(page, '1234');
  await shot(page, '16-dean-tonight-dark');
  await page.evaluate(() => { localStorage.setItem('rh-theme', 'light'); document.documentElement.setAttribute('data-theme', 'light'); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, '17-dean-desktop');
  await tab(page, 'Floors').click();
  await shot(page, '18-floors-desktop');
  await tab(page, 'Settings').click();
  await shot(page, '19-settings-desktop');
  await page.getByRole('link', { name: /Status types/ }).click();
  await shot(page, '20-status-types-desktop');
  expect(true).toBe(true);
});

import { expect, test } from './fixtures';

test('saves and approves packaging setup, changes dimensions and preserves label history', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/products');
  const setup = page.locator('.packaging-setup').filter({
    has: page.getByText('Packaging & label setup · Preview Italian dressing', { exact: true }),
  });
  await setup.locator('summary').first().click();
  // Preserve the fixture's existing product configuration until explicitly approved.
  await expect(setup.getByLabel('Gallons per bag', { exact: true })).toHaveValue('2');
  await expect(setup.getByLabel('Bags per case', { exact: true })).toHaveValue('2');
  await setup.getByLabel('Gallons per bag', { exact: true }).fill('1');
  await setup.getByLabel('Bags per case', { exact: true }).fill('4');
  await expect(setup.getByLabel('Label width (inches)')).toHaveValue('3');
  await expect(setup.getByLabel('Label height (inches)')).toHaveValue('5');
  await setup.getByLabel('Approved ingredient statement').fill('');
  await expect(setup.getByRole('button', { name: 'Approve packaging version' })).toBeDisabled();
  await setup.getByLabel('Label product name').fill('Italian dressing label');
  await setup.getByRole('button', { name: 'Save packaging draft' }).click();
  await expect(setup.locator('.packaging-latest')).toHaveText('Latest saved version: 1 · Draft');
  await expect(setup.locator('.packaging-current')).toContainText('No approved version');
  await setup.getByLabel('Approved ingredient statement').fill('Approved test statement: oil, vinegar, garlic.');
  await setup.getByRole('button', { name: 'Approve packaging version' }).click();
  await expect(setup.locator('.packaging-current')).toContainText('Approved version 2');
  await setup.getByLabel('Label width (inches)').fill('4');
  await setup.getByLabel('Label height (inches)').fill('6');
  await setup.getByRole('button', { name: 'Save packaging draft' }).click();
  await expect(setup.locator('.packaging-latest')).toHaveText('Latest saved version: 3 · Draft');
  await expect(setup.locator('.packaging-current')).toContainText('3 × 5 in');
  await setup.getByText('Version history', { exact: true }).click();
  await setup.getByText('Version 2 · Approved', { exact: true }).click();
  const approvedHistory = setup.getByText('Version 2 · Approved', { exact: true }).locator('..');
  await expect(approvedHistory.getByText('3 × 5 inches', { exact: true })).toBeVisible();
  await expect(setup.getByText('SAMPLE · NOT FOR PRODUCT USE').first()).toBeVisible();
  const tableFits = await page.locator('.table-wrap')
    .evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(tableFits).toBe(true);
  await page.screenshot({ path: info.outputPath('packaging-setup.png'), fullPage: true });
  await page.reload();
  await setup.locator('summary').first().click();
  await expect(setup.getByLabel('Label width (inches)')).toHaveValue('4');
  expect(errors).toEqual([]);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

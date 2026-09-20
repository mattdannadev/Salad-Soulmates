import { expect, test } from './fixtures';

test('adds a supplier from the directory and preserves purchase-order access', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/suppliers');
  await expect(page.getByRole('table', { name: 'Supplier directory' })).toContainText('Open purchase orders');
  await page.getByRole('link', { name: '+ Add supplier', exact: true }).click();
  await page.getByLabel('Supplier name').fill('New directory supplier');
  await page.getByLabel('Contact name').fill('Test contact');
  await page.getByLabel('Email', { exact: true }).fill('supplier@example.test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers$/);
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'New directory supplier', exact: true }) });
  await expect(row).toContainText('Test contact');
  await expect(row).toContainText('supplier@example.test');
  await expect(row).toContainText('Active');
  await expect(row.getByRole('cell').last()).toHaveText('0');
  const details = page.locator('details.supplier-orders').filter({ hasText: 'New directory supplier' });
  await details.locator(':scope > summary').click();
  await expect(details.getByText('No purchase orders for this supplier yet.', { exact: true })).toBeVisible();
  await expect(
    details.getByRole('link', { name: 'New purchase order', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('supplier-directory.png'), fullPage: true });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

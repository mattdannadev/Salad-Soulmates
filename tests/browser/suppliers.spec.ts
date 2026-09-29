import { expect, test } from './fixtures';

test('adds a supplier from the directory and preserves purchase-order access', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/suppliers');
  const directory = page.getByRole('region', { name: 'Supplier directory' });
  const grid = directory.getByRole('grid');
  await expect(grid.getByRole('columnheader', { name: 'Open purchase orders' })).toBeVisible();
  await page.goto('/app/suppliers?q=greens&sort=name&page=2');
  await page.getByRole('link', { name: '+ Add supplier', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\/new\?returnTo=/);
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\?q=greens&sort=name&page=2$/);
  await page.getByRole('link', { name: '+ Add supplier', exact: true }).click();
  await page.getByLabel('Supplier name').fill('New directory supplier');
  await page.getByLabel('Contact name').fill('Test contact');
  await page.getByLabel('Email', { exact: true }).fill('supplier@example.test');
  await page.getByRole('button', { name: 'Create supplier', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\?q=greens&sort=name&page=2#supplier-/);
  await page.getByRole('link', { name: 'Clear all' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('New directory supplier');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByRole('region', { name: 'Supplier directory' })
    .getByRole('grid').getByRole('row')
    .filter({ has: page.getByRole('gridcell', { name: 'New directory supplier', exact: true }) });
  await expect(row).toContainText('Test contact');
  await expect(row).toContainText('supplier@example.test');
  await expect(row).toContainText('Active');
  await expect(row.getByRole('gridcell').last()).toHaveText('0');
  const details = page.locator('details.supplier-orders').filter({ hasText: 'New directory supplier' });
  const detailLink = row.getByRole('link', { name: 'New directory supplier', exact: true });
  const detailHash = await detailLink.getAttribute('href');
  if (!detailHash) throw new Error('Supplier detail link is missing its hash target.');
  expect(detailHash).toMatch(/^#supplier-/);
  await detailLink.click();
  await expect(page).toHaveURL(/\/app\/suppliers\?q=New\+directory\+supplier#supplier-/);
  await expect(details).toHaveAttribute('open', '');
  await expect(details.getByText('No purchase orders for this supplier yet.', { exact: true })).toBeVisible();
  await expect(
    details.getByRole('link', { name: 'New purchase order', exact: true }),
  ).toBeVisible();
  await page.goto(`/app/suppliers${detailHash}`);
  await expect(details).toHaveAttribute('open', '');
  await details.evaluate((element) => element.removeAttribute('open'));
  await page.evaluate(() => {
    window.location.hash = '';
  });
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, detailHash);
  await expect(details).toHaveAttribute('open', '');
  await page.screenshot({ path: info.outputPath('supplier-directory.png'), fullPage: true });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

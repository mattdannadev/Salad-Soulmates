import { expect, test } from './fixtures';

test('adds a supplier from the directory and preserves purchase-order access', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/suppliers');
  const directory = page.getByRole('region', { name: 'Supplier directory' });
  const grid = directory.getByRole('grid');
  await expect(grid.getByRole('columnheader', { name: 'Open purchase orders' })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'Status' })).toHaveCount(0);
  await page.goto('/app/suppliers?q=greens&sort=name&page=2');
  await page.getByRole('link', { name: '+ Add supplier', exact: true }).click();
  const supplierDialog = page.getByRole('dialog', { name: 'Add supplier' });
  await expect(supplierDialog).toBeVisible();
  await expect(page).toHaveURL(/\/app\/suppliers\?.*create=supplier/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
    '/app/suppliers?q=greens&sort=name&page=2',
  );
  await supplierDialog.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\?q=greens&sort=name&page=2$/);
  await page.getByRole('link', { name: '+ Add supplier', exact: true }).click();
  await expect(supplierDialog).toBeVisible();
  await supplierDialog.getByLabel('Supplier name *').fill('New directory supplier');
  await supplierDialog.getByLabel('Contact name').fill('Test contact');
  await supplierDialog.getByLabel('Email', { exact: true }).fill('supplier@example.test');
  await supplierDialog.getByRole('button', { name: 'Create supplier', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\/created\?returnTo=/);
  await expect(page.getByRole('heading', { name: 'Supplier saved', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choose an ingredient', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to suppliers', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\?q=greens&sort=name&page=2$/);
  await page.getByRole('link', { name: 'Clear all' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('New directory supplier');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page
    .getByRole('region', { name: 'Supplier directory' })
    .getByRole('grid')
    .getByRole('row')
    .filter({ has: page.getByRole('gridcell', { name: 'New directory supplier', exact: true }) });
  await expect(row).toContainText('Test contact');
  await expect(row).toContainText('supplier@example.test');
  await expect(row.getByRole('gridcell').last()).toHaveText('0');
  const details = page
    .locator('details.supplier-orders')
    .filter({ hasText: 'New directory supplier' });
  const detailLink = row.getByRole('link', { name: 'New directory supplier', exact: true });
  const detailHash = await detailLink.getAttribute('href');
  if (!detailHash) throw new Error('Supplier detail link is missing its hash target.');
  expect(detailHash).toMatch(/^#supplier-/);
  await detailLink.click();
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        hash: url.hash,
        query: url.searchParams.get('q'),
        sort: url.searchParams.get('sort'),
      };
    })
    .toEqual({
      hash: expect.stringMatching(/^#supplier-/),
      query: 'New directory supplier',
      sort: 'name',
    });
  await expect(details).toHaveAttribute('open', '');
  await expect(
    details.getByText('No purchase orders for this supplier yet.', { exact: true }),
  ).toBeVisible();
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

test('supplier directory uses one vertical scroll area on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 548, height: 780 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/suppliers');
  const directory = page.getByRole('region', { name: 'Supplier directory' });
  await expect(directory.getByRole('link').first()).toBeVisible();
  await expect(directory.getByRole('grid')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

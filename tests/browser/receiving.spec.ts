import { expect, test } from './fixtures';

test('receive physical packages, print labels, resolve a barcode, and preserve audited balances', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/receiving');
  await page.getByLabel('Quantity received').fill('50');
  await page.getByLabel('Supplier lot *', { exact: true }).fill('TRACE-LOT-1');
  await page.getByLabel('Expiration date').fill('2099-10-01');
  await page.getByLabel('Quantity in each physical package').fill('30 | SUPPLIER-ONE\n19');
  await page.getByRole('button', { name: 'Post receipt & update inventory' }).click();
  await expect(page.getByRole('alert')).toContainText('Package quantities must equal');
  await page.getByLabel('Quantity in each physical package').fill('30 | SUPPLIER-ONE\n20');
  await page.getByRole('button', { name: 'Post receipt & update inventory' }).click();
  await expect(page.getByRole('status')).toContainText('packages serialized');
  await page.getByRole('link', { name: 'View and print package labels' }).click();
  await expect(page.locator('.package-label')).toHaveCount(2);
  const image = page.getByRole('img').first();
  await expect(image).toBeVisible();
  await page.screenshot({ path: info.outputPath('package-labels.png'), fullPage: true });
  await page.goto('/receiving/packages');
  await page.getByLabel('Scan or enter a barcode').fill('SUPPLIER-ONE');
  await page.getByRole('button', { name: 'Find package' }).click();
  await expect(page.locator('.serial-card')).toHaveCount(1);
  await page.locator('.serial-card').click();
  await expect(page.getByRole('heading', { name: '30 lb remaining' })).toBeVisible();
  await expect(page.locator('main')).toContainText('TRACE-LOT-1');
  const serial = await page.locator('.serial-code').innerText();
  expect(serial).toMatch(/^SSU-/);
  const packageUrl = page.url();
  await page.getByText('Update balance or hold status', { exact: true }).click();
  await page.getByLabel('Remaining quantity').fill('12');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Hold');
  await page.getByLabel('Required reason')
    .fill('Measured remaining quantity during quality inspection');
  await page.getByRole('button', { name: 'Save package change' }).click();
  await expect(page.getByRole('heading', { name: '12 lb remaining' })).toBeVisible();
  await expect(page.locator('.serial-history'))
    .toContainText('Measured remaining quantity');
  await expect(page.locator('main')).toContainText('Unavailable for production');
  await page.reload();
  await expect(page.getByRole('heading', { name: '12 lb remaining' })).toBeVisible();
  const fitsPhone = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsPhone).toBe(true);
  await page.screenshot({ path: info.outputPath('package-detail.png'), fullPage: true });
  await page.getByRole('link', { name: 'Print this package label', exact: true }).click();
  await expect(page.locator('.package-label')).toHaveCount(1);
  await expect(page.getByRole('img', { name: `QR barcode ${serial}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('img', { name: `QR barcode ${serial}`, exact: true })).toBeVisible();
  await page.goto('/receiving/packages');
  await page.getByLabel('Scan or enter a barcode').fill(serial);
  await page.getByRole('button', { name: 'Find package' }).click();
  await page.locator('.serial-card').click();
  await expect(page).toHaveURL(packageUrl);
  expect(errors).toEqual([]);
});

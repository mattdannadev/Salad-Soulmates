import { expect, test } from './fixtures';

test('order draft survives customer cancel and creation without leaking entries into the URL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/u);

  await page.goto('/app/orders?q=Preview&status=unplanned#new-order');
  const customerSelect = page.getByRole('combobox', { name: 'Customer', exact: true });
  await customerSelect.selectOption({ label: 'Production customer' });
  const originalCustomerId = await customerSelect.inputValue();
  await page.getByLabel('Customer order reference (optional)').fill('Recovery reference');
  await page.getByLabel('Customer pickup date').fill('2026-10-01');
  await page.getByLabel('Preview Italian dressing', { exact: true }).fill('2');
  const addCustomer = page.getByRole('link', { name: '+ Add customer', exact: true });
  await addCustomer.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/customers\/new\?returnTo=/u);
  expect(page.url()).not.toContain('Recovery reference');
  await page.getByRole('link', { name: 'Back to orders' }).click();
  await expect(page).toHaveURL(/\/app\/orders\?.*q=Preview.*status=unplanned.*#new-order$/u);
  await expect(page.getByLabel('Customer order reference (optional)')).toHaveValue('Recovery reference');
  await expect(page.getByLabel('Customer pickup date')).toHaveValue('2026-10-01');
  await expect(page.getByLabel('Preview Italian dressing', { exact: true })).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Customer', exact: true }))
    .toHaveValue(originalCustomerId);

  await addCustomer.click();
  await page.getByLabel('Customer name', { exact: true }).fill('Recovery customer');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/orders\?.*customer=.*#new-order$/u);
  const resumedUrl = page.url();
  const resumedQuery = new URL(resumedUrl).searchParams;
  expect(resumedQuery.get('q')).toBe('Preview');
  expect(resumedQuery.get('status')).toBe('unplanned');
  const createdCustomerId = resumedQuery.get('customer');
  expect(createdCustomerId).toMatch(/^[a-f\d-]{36}$/u);
  await expect(page.getByRole('combobox', { name: 'Customer', exact: true }))
    .toHaveValue(createdCustomerId ?? '');
  await expect(page.getByLabel('Customer order reference (optional)')).toHaveValue('Recovery reference');
  await expect(page.getByLabel('Customer pickup date')).toHaveValue('2026-10-01');
  await expect(page.getByLabel('Preview Italian dressing', { exact: true })).toHaveValue('2');
  expect(resumedUrl).not.toContain('Recovery reference');

  await page.goto('/app/products');
  const options = page.locator('details.product-customer-options').first();
  await options.locator(':scope > summary').click();
  const addOption = options.locator('details').filter({ hasText: '+ Add customer option' });
  await addOption.locator('summary').click();
  await addOption.getByLabel('Customer', { exact: true }).fill('Recovery customer');
  await addOption.getByLabel('Option name', { exact: true }).fill('2-gallon bag');
  await addOption.getByRole('combobox', { name: /^Packaging/u }).selectOption('custom');
  await addOption.getByRole('combobox', { name: 'Sales unit', exact: true }).selectOption('bag');
  await addOption.getByLabel('Gallons per sales unit', { exact: true }).fill('2');
  await addOption.getByLabel('Price per unit (USD)', { exact: true }).fill('12.50');
  await addOption.getByRole('button', { name: 'Save customer option', exact: true }).click();
  await expect(options).toContainText('Recovery customer · 2-gallon bag · $12.50 / bag');
  await page.goto(resumedUrl);
  await expect(page.getByLabel('Preview Italian dressing', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
  await expect(page).toHaveURL(/\/app\/orders\?order=/u);
  await expect(page.getByRole('table', { name: 'Ordered products' })).toContainText('2-gallon bag');
  expect(errors).toEqual([]);
});

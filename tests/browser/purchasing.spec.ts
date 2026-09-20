import { expect, test } from './fixtures';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    console.error('Synthetic browser failure:', await page.locator('main').ariaSnapshot());
});

test('customer packaging and order estimates lead to purchasing and partial receipt', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/products');
  const productGrid = page.locator('main table').first();
  await expect(productGrid.getByRole('columnheader')).toHaveCount(4);
  await expect(productGrid).toContainText('gal per bag');
  const customerOptions = page.locator('details.product-customer-options').first();
  await expect(customerOptions).not.toHaveAttribute('open', '');
  await customerOptions.locator(':scope > summary').click();
  let addOption = customerOptions.locator('details').filter({ hasText: '+ Add customer option' });
  await addOption.locator('summary').click();
  await addOption.getByLabel('Customer', { exact: true }).fill('Preview customer');
  await addOption.getByLabel('Option name', { exact: true }).fill('2-gallon bag');
  await addOption.getByRole('combobox', { name: /^Packaging/ }).selectOption('custom');
  await addOption.getByLabel('Sales unit', { exact: true }).fill('bag');
  await addOption.getByLabel('Gallons per sales unit', { exact: true }).fill('2');
  await addOption.getByLabel('Price per unit (USD)', { exact: true }).fill('12.50');
  await addOption.getByRole('button', { name: 'Save customer option', exact: true }).click();
  await expect(
    customerOptions.getByText('Preview customer · 2-gallon bag · $12.50 / bag', { exact: true }),
  ).toBeVisible();
  addOption = customerOptions.locator('details').filter({ hasText: '+ Add customer option' });
  await addOption.locator('summary').click();
  await addOption.getByLabel('Customer', { exact: true }).fill('Preview customer');
  await addOption.getByLabel('Option name', { exact: true }).fill('Standard case');
  await addOption.getByLabel('Price per unit (USD)', { exact: true }).fill('24');
  await addOption.getByRole('button', { name: 'Save customer option', exact: true }).click();
  await expect(
    customerOptions.getByText('Preview customer · Standard case · $24.00 / case', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('customer-packaging-pricing.png'),
    fullPage: true,
  });

  await page.goto('/app/orders');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customer orders');
  await expect(page.getByLabel('Worksheet name')).toHaveCount(0);
  await page.getByLabel('Customer', { exact: true }).fill('Preview customer');
  await page.getByLabel('Customer order reference (optional)').fill(`Order ${info.project.name}`);
  await page.getByLabel('Customer needs by').fill('2026-10-01');
  await page.getByLabel('Preview Italian dressing', { exact: true }).fill('40');
  await page
    .getByRole('combobox', { name: /^Packaging & price/ })
    .selectOption({ label: '2-gallon bag · $12.50 / bag' });
  await page.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
  await expect(page).toHaveURL(/\/app\/orders\?order=/);
  const orderUrl = page.url();
  await expect(
    page.getByRole('table', { name: 'Ingredient requirements', exact: true }),
  ).toContainText('Preview garlic powder');
  await expect(page.getByRole('table', { name: 'Ordered products', exact: true })).toContainText(
    '$10,000.00',
  );
  await page.getByText('How these quantities were calculated', { exact: true }).click();
  await expect(page.locator('main')).toContainText('40');
  await page.screenshot({ path: info.outputPath('customer-order-estimate.png'), fullPage: true });

  await page.goto('/app/products');
  await customerOptions.locator(':scope > summary').click();
  const bagOption = customerOptions
    .locator('details')
    .filter({ hasText: 'Preview customer · 2-gallon bag · $12.50 / bag' });
  await bagOption.locator('summary').click();
  await bagOption.getByLabel('Price per unit (USD)', { exact: true }).fill('15');
  await bagOption.getByRole('button', { name: 'Save customer option', exact: true }).click();
  await expect(
    customerOptions.getByText('Preview customer · 2-gallon bag · $15.00 / bag', { exact: true }),
  ).toBeVisible();
  await page.goto(orderUrl);
  await expect(page.getByRole('table', { name: 'Ordered products', exact: true })).toContainText(
    '$12.50 / bag',
  );
  await expect(page.getByRole('table', { name: 'Ordered products', exact: true })).toContainText(
    '$10,000.00',
  );
  await page.getByRole('link', { name: 'Review purchasing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchasing', exact: true })).toBeVisible();
  await page.goto('/app/suppliers');
  const supplier = page.locator('details.supplier-orders').filter({ hasText: 'Preview supplier' });
  await expect(supplier).not.toHaveAttribute('open', '');
  // Streamed server content exists in a hidden container before it is displayed.
  await expect(supplier.locator(':scope > summary')).toBeVisible();
  await supplier.locator(':scope > summary').press('Enter');
  await expect(supplier).toHaveAttribute('open', '');
  await expect(
    supplier.getByText('No purchase orders for this supplier yet.', { exact: true }),
  ).toBeVisible();
  await expect(supplier.getByLabel('Supplier name', { exact: true })).not.toBeVisible();
  await expect(
    supplier.getByRole('heading', { name: 'Preview customer', exact: true }),
  ).toBeVisible();
  await expect(supplier.locator('.supplier-demand')).toContainText('Oct 1, 2026');
  await expect(supplier.locator('.supplier-demand')).toContainText('No purchase order yet');
  await supplier.getByRole('link', { name: 'New purchase order', exact: true }).click();
  await expect(page).toHaveURL(/supplier=/);
  await expect(
    page.getByText('Selected supplier: Preview supplier', { exact: false }),
  ).toBeVisible();
  await page
    .locator('.worksheet-links')
    .getByRole('link', { name: `Preview customer · Order ${info.project.name}`, exact: false })
    .click();
  await expect(page).toHaveURL(/plan=.*supplier=/);
  await page.getByRole('button', { name: 'Create draft for Preview supplier' }).click();
  await expect(page.getByRole('article').getByText('Draft', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to suppliers', exact: true }).click();
  await supplier.locator(':scope > summary').click();
  const draft = page.getByRole('article').filter({ hasText: 'Preview supplier' });
  await expect(draft).toContainText('60 lb');
  await draft.getByText('Update status', { exact: true }).click();
  await draft.getByLabel('External order reference').fill(`PO-${info.project.name}`);
  await draft.getByRole('button', { name: 'Save purchase status' }).click();
  await expect(draft.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(draft).toContainText('Customer needs by');
  await expect(draft).toContainText('Expected delivery');
  await page.screenshot({ path: info.outputPath('purchasing.png'), fullPage: true });
  await page.goto('/app/receiving');
  await page.getByLabel('Quantity received').fill('10');
  await page.getByLabel('Quantity in each physical package').fill('10');
  await page
    .getByLabel('Confirmed inbound order (optional)')
    .selectOption({ label: `PO-${info.project.name} · Preview garlic powder · 60 lb` });
  await page.getByLabel('Supplier lot *', { exact: true }).fill('TEST-LOT');
  await page.getByRole('button', { name: 'Post receipt & update inventory' }).click();
  await expect(page.getByRole('status')).toContainText('Receipt posted');
  await page.goto('/app/purchasing');
  await expect(
    page.getByRole('article').getByRole('row').filter({ hasText: 'Preview garlic powder' }),
  ).toContainText('50 lb');
  await page.goto('/app/suppliers');
  await supplier.locator(':scope > summary').click();
  await expect(
    supplier.getByRole('article').getByText('Partially received', { exact: true }),
  ).toBeVisible();
  await expect(supplier.getByRole('article')).toContainText('50 lb');
  await expect(
    page.getByRole('row').filter({ hasText: 'Preview supplier' }).first().getByRole('cell').last(),
  ).toHaveText('1');
  const fitsScreen = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsScreen).toBe(true);
  await page.screenshot({ path: info.outputPath('supplier-purchase-orders.png'), fullPage: true });
  await expect(page.locator('body')).not.toContainText('Application error');
  expect(errors).toEqual([]);
});

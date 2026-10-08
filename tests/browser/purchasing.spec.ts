import { expect, test } from './fixtures';

function isPlannedSupplierPurchaseUrl(url: URL) {
  return [
    url.pathname === '/app/purchasing',
    Boolean(url.searchParams.get('plan')),
    Boolean(url.searchParams.get('supplier')),
  ].every(Boolean);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    console.error('Synthetic browser failure:', await page.locator('main').ariaSnapshot());
  }
});

test('inventory starts a purchase with its ingredient fixed', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/inventory');
  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' });
  const mobileNavigation = page.getByRole('dialog', {
    name: 'Main navigation',
    exact: true,
  });
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'More sections', exact: true }).click();
    await expect(mobileNavigation).toBeVisible();
  }
  await expect(mainNavigation.getByRole('link', { name: 'Purchasing', exact: true })).toHaveCount(
    1,
  );
  if (info.project.name === 'phone') {
    await mobileNavigation.getByRole('button', { name: 'Close navigation', exact: true }).click();
    await expect(mobileNavigation).toBeHidden();
  }
  const inventory = page.getByRole('region', { name: 'On-hand inventory', exact: true });
  const garlicPowder = inventory.getByRole('row').filter({ hasText: 'Preview garlic powder' });
  await garlicPowder.getByRole('link', { name: 'Purchase', exact: true }).click();
  await expect(page).toHaveURL(
    /\/app\/purchasing\?ingredient=00000000-0000-4000-8000-000000000100$/,
  );
  await page.getByRole('link', { name: 'New purchase order', exact: true }).click();
  await expect(page).toHaveURL(
    /\/app\/purchasing\?ingredient=00000000-0000-4000-8000-000000000100&create=1/,
  );
  await expect(page.getByText('Selected ingredient: Preview garlic powder')).toBeVisible();
  const purchaseDialog = page.getByRole('dialog', {
    name: 'Select a supplier for Preview garlic powder',
    exact: true,
  });
  await expect(purchaseDialog).toBeVisible();
  await expect(
    purchaseDialog.getByText('The ingredient is fixed.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Preview lemon juice', { exact: true })).toHaveCount(0);
  await purchaseDialog.getByLabel('Expected delivery').fill('2026-10-01');
  await purchaseDialog.getByLabel(/Whole packs \(0 skips this ingredient\)/).fill('2');
  const createPurchase = purchaseDialog.getByRole('button', {
    name: 'Create purchase order',
    exact: true,
  });
  await expect(createPurchase).toBeEnabled();
  if (info.project.name === 'phone') {
    await createPurchase.scrollIntoViewIfNeeded();
    await expect(createPurchase).toBeInViewport();
    expect(
      await createPurchase.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const hitTarget = document.elementFromPoint(centerX, centerY);
        return hitTarget !== null && button.contains(hitTarget);
      }),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await createPurchase.click();
  await expect(page.getByRole('article').getByText('Confirmed', { exact: true })).toBeVisible();
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
  const productGrid = page.getByRole('region', { name: 'Product directory', exact: true });
  await expect(productGrid.getByRole('columnheader')).toHaveCount(4);
  await expect(productGrid).toContainText('gal per bag');
  const customerOptions = page.locator('details.product-customer-options').first();
  await expect(customerOptions).not.toHaveAttribute('open', '');
  await customerOptions.locator(':scope > summary').click();
  await customerOptions.getByText('+ Add customer option', { exact: true }).click();
  const addOption = customerOptions.locator('form:has(select[name="customer_id"]:not(:disabled))');
  await expect(addOption).toBeVisible();
  await addOption.locator('select[name="customer_id"]').selectOption({
    label: 'Preview customer',
  });
  await addOption.getByLabel('Option name', { exact: true }).fill('2-gallon bag');
  await addOption.getByRole('combobox', { name: /^Packaging/ }).selectOption('custom');
  await addOption.getByRole('combobox', { name: 'Sales unit', exact: true }).selectOption('bag');
  await addOption.getByLabel('Gallons per sales unit', { exact: true }).fill('2');
  await addOption.getByLabel('Price per unit (USD)', { exact: true }).fill('12.50');
  await addOption.getByRole('button', { name: 'Save customer option', exact: true }).click();
  await expect(
    customerOptions.getByText('Preview customer · 2-gallon bag · $12.50 / bag', { exact: true }),
  ).toBeVisible();
  await customerOptions.getByText('+ Add customer option', { exact: true }).click();
  await expect(addOption).toBeVisible();
  await addOption.locator('select[name="customer_id"]').selectOption({
    label: 'Preview customer',
  });
  await addOption.getByLabel('Option name', { exact: true }).fill('Standard case');
  await addOption.getByLabel('Price per unit (USD)', { exact: true }).fill('24');
  await addOption.getByLabel('Preferred ordering unit', { exact: true }).selectOption('false');
  await addOption.getByRole('button', { name: 'Save customer option', exact: true }).click();
  await expect(
    customerOptions.getByText('Preview customer · Standard case · $24.00 / case', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('customer-packaging-pricing.png'),
    fullPage: true,
  });

  await page.goto('/app/orders');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orders');
  await expect(page.getByLabel('Worksheet name')).toHaveCount(0);
  await page.getByRole('link', { name: 'New order', exact: true }).click();
  const newOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await expect(newOrderDialog).toBeVisible();
  await newOrderDialog
    .getByRole('combobox', { name: 'Customer', exact: true })
    .selectOption({ label: 'Preview customer' });
  const orderingUnit = newOrderDialog.getByRole('combobox', { name: 'Ordering unit', exact: true });
  await expect(orderingUnit).toBeEnabled();
  await expect(orderingUnit).toHaveValue(/^[0-9a-f-]{36}$/);
  await expect(orderingUnit.locator('option:checked')).toHaveText('bag');
  await newOrderDialog
    .getByLabel('Customer order reference (optional)')
    .fill(`Order ${info.project.name}`);
  await newOrderDialog.getByLabel('Customer pickup date').fill('2026-10-01');
  await newOrderDialog.getByLabel('Preview Italian dressing', { exact: true }).fill('40');
  await orderingUnit.selectOption({ label: 'bag' });
  await newOrderDialog.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
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
  await page.getByRole('link', { name: 'Review shortages & purchases', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/purchasing\?plan=/u);
  await expect(page.getByRole('heading', { name: /^Purchase planning/u })).toBeVisible();
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
  await supplier
    .getByRole('link', { name: 'Prepare purchase for this order', exact: true })
    .click();
  await expect(page).toHaveURL(isPlannedSupplierPurchaseUrl);
  await expect(
    page.getByText('Selected supplier: Preview supplier', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'New purchase order', exact: true }).click();
  const purchaseDialog = page.getByRole('dialog', { name: 'New purchase order', exact: true });
  await expect(purchaseDialog).toBeVisible();
  await expect(purchaseDialog.getByText('Required: 40 lb', { exact: false })).toBeVisible();
  await expect(purchaseDialog.getByText('On hand: 0 lb', { exact: false })).toBeVisible();
  await expect(purchaseDialog.getByText('Confirmed inbound: 0 lb', { exact: false })).toBeVisible();
  await expect(purchaseDialog.getByText('Recommended quantity: 2 pail = 60 lb')).toBeVisible();
  await expect(
    purchaseDialog.getByText('20 lb over the raw shortage', { exact: false }),
  ).toBeVisible();
  const orderNow = purchaseDialog.getByLabel('Preview garlic powder · Order now (pail)');
  const overrideReason = purchaseDialog.getByLabel('Preview garlic powder · Override reason');
  await orderNow.fill('');
  await expect(
    purchaseDialog.getByText(
      'Enter a valid whole-pack quantity to review the ordered base quantity.',
    ),
  ).toBeVisible();
  await orderNow.fill('1.5');
  await expect(
    purchaseDialog.getByText(
      'Enter a valid whole-pack quantity to review the ordered base quantity.',
    ),
  ).toBeVisible();
  await orderNow.fill('1');
  await expect(
    purchaseDialog.getByText('10 lb under the raw shortage', { exact: false }),
  ).toBeVisible();
  await expect(overrideReason).toHaveAttribute('required', '');
  await expect(
    purchaseDialog.getByText('Explain why Order now differs from the recommended quantity.', {
      exact: false,
    }),
  ).toBeVisible();
  await overrideReason.fill('  a  ');
  expect(
    await overrideReason.evaluate(
      (input) => input instanceof HTMLInputElement && input.checkValidity(),
    ),
  ).toBe(false);
  await overrideReason.fill(' a b ');
  expect(
    await overrideReason.evaluate(
      (input) => input instanceof HTMLInputElement && input.checkValidity(),
    ),
  ).toBe(true);
  await overrideReason.fill('Use remaining stock before ordering another pail');
  await orderNow.fill('2');
  await expect(overrideReason).not.toHaveAttribute('required', '');
  await expect(overrideReason).toHaveValue('');
  await expect(
    purchaseDialog.getByText('Explain why Order now differs from the recommended quantity.', {
      exact: false,
    }),
  ).toHaveCount(0);
  await purchaseDialog
    .getByRole('button', { name: 'Create purchase draft for Preview supplier' })
    .click();
  await expect(page.getByRole('article').getByText('Draft', { exact: true })).toBeVisible();
  await purchaseDialog
    .getByRole('button', { name: 'Close new purchase order', exact: true })
    .click();
  await expect(purchaseDialog).toBeHidden();
  await page.getByRole('link', { name: 'Back to suppliers', exact: true }).click();
  await supplier.locator(':scope > summary').click();
  const draft = page.getByRole('article').filter({ hasText: 'Preview supplier' });
  await expect(draft).toContainText('60 lb');
  await draft.getByText('Update status', { exact: true }).click();
  await draft.getByLabel('External order reference').fill(`PO-${info.project.name}`);
  await draft.getByLabel('Supplier quoted total cost (USD)').fill('24.50');
  await draft.getByLabel('Date placed with supplier').fill('2026-09-29');
  await draft.getByRole('button', { name: 'Save purchase status' }).click();
  await expect(draft.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(draft).toContainText('Customer pickup date');
  await expect(draft).toContainText('Expected delivery');
  await page.screenshot({ path: info.outputPath('purchasing.png'), fullPage: true });
  await page.goto('/app/receiving');
  await page.getByRole('link', { name: 'Receive without a purchase order', exact: true }).click();
  const receiveWithoutPurchaseOrderDialog = page.getByRole('dialog', {
    name: 'Receive without a purchase order',
    exact: true,
  });
  await expect(receiveWithoutPurchaseOrderDialog).toBeVisible();
  await receiveWithoutPurchaseOrderDialog.getByLabel('Quantity received').fill('10');
  await receiveWithoutPurchaseOrderDialog
    .getByLabel('Quantity in each physical package')
    .fill('10');
  const inboundOrder = receiveWithoutPurchaseOrderDialog.getByRole('combobox', {
    name: 'Confirmed inbound order (optional)',
  });
  await inboundOrder.selectOption({
    label: `PO-${info.project.name} · Preview garlic powder · 60 lb`,
  });
  const capturedPack = receiveWithoutPurchaseOrderDialog.getByRole('combobox', {
    name: /^Supplier pack from confirmed order/,
  });
  await expect(capturedPack.locator('option:checked')).toHaveText('pail · 30 lb');
  await inboundOrder.selectOption('');
  await expect(
    receiveWithoutPurchaseOrderDialog.getByRole('combobox', {
      name: 'Supplier item / pack (optional)',
    }),
  ).toHaveValue('');
  await inboundOrder.selectOption({
    label: `PO-${info.project.name} · Preview garlic powder · 60 lb`,
  });
  await expect(capturedPack.locator('option:checked')).toHaveText('pail · 30 lb');
  await receiveWithoutPurchaseOrderDialog
    .getByLabel(/^Supplier-provided lot \(if shown\)/)
    .fill('TEST-LOT');
  await receiveWithoutPurchaseOrderDialog
    .getByRole('button', { name: 'Post receipt & update inventory' })
    .click();
  await expect(page.getByRole('status')).toContainText('Receipt posted');
  await page.goto('/app/purchasing');
  await expect(
    page.getByRole('article').getByRole('row').filter({ hasText: 'Preview garlic powder' }),
  ).toContainText('50 lb');
  await page.goto('/app');
  const unreceivedDeliveries = page.getByRole('link', {
    name: /^Review unreceived deliveries\b/u,
  });
  await expect(unreceivedDeliveries).toContainText('1 confirmed purchases awaiting receipt');
  await expect(unreceivedDeliveries).toHaveAttribute(
    'href',
    '/app/purchasing?delivery=unreceived&sort=due-soon',
  );
  await unreceivedDeliveries.click();
  await expect(page).toHaveURL(/\/app\/purchasing\?delivery=unreceived&sort=due-soon$/);
  await expect(page.getByRole('article')).toContainText('Preview garlic powder');
  await page.reload();
  await expect(page).toHaveURL(/\/app\/purchasing\?delivery=unreceived&sort=due-soon$/);
  // Reloaded browser-history behavior is not an application return contract.
  // Use the explicit Dashboard action that users have on both responsive layouts.
  const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true }).first();
  await expect(dashboard).toHaveAttribute('href', '/app');
  await dashboard.click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/suppliers');
  await supplier.locator(':scope > summary').click();
  await expect(
    supplier.getByRole('article').getByText('Partially received', { exact: true }),
  ).toBeVisible();
  await expect(supplier.getByRole('article')).toContainText('50 lb');
  const supplierRow = page.getByRole('row').filter({ hasText: 'Preview supplier' }).first();
  await expect(supplierRow.getByRole('gridcell').last()).toHaveText('1');
  const fitsScreen = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsScreen).toBe(true);
  await page.screenshot({ path: info.outputPath('supplier-purchase-orders.png'), fullPage: true });
  await expect(page.locator('body')).not.toContainText('Application error');
  expect(errors).toEqual([]);
});

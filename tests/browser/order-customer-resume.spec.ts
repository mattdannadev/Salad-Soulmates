import { expect, test } from './fixtures';

const orderDraftId = '10000000-0000-4000-8000-000000000001';

function isRestoredOrderDraftUrl(url: URL) {
  return [
    url.pathname === '/app/orders',
    url.searchParams.get('q') === 'Preview',
    url.searchParams.get('status') === 'unplanned',
    url.searchParams.get('draft') === orderDraftId,
    url.searchParams.get('create') === 'order',
  ].every(Boolean);
}

function isCustomerAttachedOrderDraftUrl(url: URL) {
  return [isRestoredOrderDraftUrl(url), Boolean(url.searchParams.get('customer'))].every(Boolean);
}

function isSavedOrderDetailUrl(url: URL) {
  return [
    url.pathname === '/app/orders',
    url.searchParams.get('q') === 'Preview',
    url.searchParams.get('status') === 'unplanned',
    Boolean(url.searchParams.get('order')),
    !url.searchParams.has('create'),
    !url.searchParams.has('customer'),
    !url.searchParams.has('draft'),
  ].every(Boolean);
}

test('order draft survives customer cancel and creation without leaking entries into the URL', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/u);

  await page.goto(`/app/orders?q=Preview&status=unplanned&draft=${orderDraftId}&create=order`);
  const newOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await expect(newOrderDialog).toBeVisible();
  const customerSelect = newOrderDialog.getByRole('combobox', { name: 'Customer', exact: true });
  await customerSelect.selectOption({ label: 'Production customer' });
  const originalCustomerId = await customerSelect.inputValue();
  await newOrderDialog.getByLabel('Customer order reference (optional)').fill('Recovery reference');
  await newOrderDialog.getByLabel('Customer pickup date').fill('2026-10-01');
  await newOrderDialog.getByLabel('Preview Italian dressing', { exact: true }).fill('2');
  const addCustomer = newOrderDialog.getByRole('link', { name: '+ Add customer', exact: true });
  await addCustomer.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/customers\?create=customer&returnTo=/u);
  const newCustomerDialog = page.getByRole('dialog', { name: 'Add customer', exact: true });
  await expect(newCustomerDialog).toBeVisible();
  expect(page.url()).not.toContain('Recovery reference');
  await newCustomerDialog
    .getByRole('button', { name: 'Close customer creation', exact: true })
    .click();
  await expect(page).toHaveURL(isRestoredOrderDraftUrl);
  await expect(newOrderDialog).toBeVisible();
  await expect(newOrderDialog.getByLabel('Customer order reference (optional)')).toHaveValue(
    'Recovery reference',
  );
  await expect(newOrderDialog.getByLabel('Customer pickup date')).toHaveValue('2026-10-01');
  await expect(newOrderDialog.getByLabel('Preview Italian dressing', { exact: true })).toHaveValue(
    '2',
  );
  await expect(customerSelect).toHaveValue(originalCustomerId);

  await addCustomer.click();
  await expect(newCustomerDialog).toBeVisible();
  await newCustomerDialog.getByLabel('Customer name', { exact: true }).fill('Recovery customer');
  await newCustomerDialog.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(page).toHaveURL(isCustomerAttachedOrderDraftUrl);
  await expect(newOrderDialog).toBeVisible();
  const resumedUrl = page.url();
  const resumedQuery = new URL(resumedUrl).searchParams;
  expect(resumedQuery.get('q')).toBe('Preview');
  expect(resumedQuery.get('status')).toBe('unplanned');
  const createdCustomerId = resumedQuery.get('customer');
  expect(createdCustomerId).toMatch(/^[a-f\d-]{36}$/u);
  await expect(customerSelect).toHaveValue(createdCustomerId ?? '');
  await expect(newOrderDialog.getByLabel('Customer order reference (optional)')).toHaveValue(
    'Recovery reference',
  );
  await expect(newOrderDialog.getByLabel('Customer pickup date')).toHaveValue('2026-10-01');
  await expect(newOrderDialog.getByLabel('Preview Italian dressing', { exact: true })).toHaveValue(
    '2',
  );
  expect(resumedUrl).not.toContain('Recovery reference');

  await newOrderDialog.getByRole('link', { name: 'Configure products →', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/products\?returnTo=/u);
  const resumed = new URL(resumedUrl);
  const productReturn = new URL(new URL(page.url()).searchParams.get('returnTo') ?? '', page.url());
  expect(productReturn.pathname).toBe(resumed.pathname);
  expect([...productReturn.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))).toEqual(
    [...resumed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  expect(productReturn.hash).toBe(resumed.hash);
  const options = page.locator('details.product-customer-options').first();
  await options.locator(':scope > summary').click();
  await options.getByText('+ Add customer option', { exact: true }).click();
  const addCustomerOption = options.locator('form:has(select[name="customer_id"]:not(:disabled))');
  await expect(addCustomerOption).toBeVisible();
  await addCustomerOption.locator('select[name="customer_id"]').selectOption({
    label: 'Recovery customer',
  });
  await addCustomerOption.getByLabel('Option name', { exact: true }).fill('2-gallon bag');
  await addCustomerOption.getByRole('combobox', { name: /^Packaging/u }).selectOption('custom');
  await addCustomerOption
    .getByRole('combobox', { name: 'Sales unit', exact: true })
    .selectOption('bag');
  await addCustomerOption.getByLabel('Gallons per sales unit', { exact: true }).fill('2');
  await addCustomerOption.getByLabel('Price per unit (USD)', { exact: true }).fill('12.50');
  await addCustomerOption
    .getByRole('button', { name: 'Save customer option', exact: true })
    .click();
  // Saving a customer option returns directly to the suspended order draft.
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        params: Object.fromEntries(url.searchParams),
        hash: url.hash,
      };
    })
    .toEqual({
      pathname: resumed.pathname,
      params: Object.fromEntries(resumed.searchParams),
      hash: resumed.hash,
    });
  await expect(newOrderDialog.getByLabel('Preview Italian dressing', { exact: true })).toHaveValue(
    '2',
  );
  await newOrderDialog.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
  await expect(page).toHaveURL(isSavedOrderDetailUrl);
  const savedOrderUrl = new URL(page.url());
  expect(savedOrderUrl.searchParams.get('order')).toMatch(/^[a-f\d-]{36}$/u);
  expect(savedOrderUrl.searchParams.get('q')).toBe('Preview');
  expect(savedOrderUrl.searchParams.get('status')).toBe('unplanned');
  await expect(page.getByRole('table', { name: 'Ordered products' })).toContainText('2-gallon bag');
  expect(errors).toEqual([]);
});

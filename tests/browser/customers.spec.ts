import { expect, test } from './fixtures';

const FUTURE_PICKUP_OFFSET_DAYS = 14;

function futureCalendarDate(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function isCustomerAttachedOrderUrl(url: URL) {
  return [
    url.pathname === '/app/orders',
    Boolean(url.searchParams.get('customer')),
    url.searchParams.get('create') === 'order',
  ].every(Boolean);
}

test('customer directory keeps search and restores focus after an edit', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await page.goto('/app/customers/new');
  await page.getByLabel('Customer name', { exact: true }).fill('Directory focus customer');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/customers\?customer=/);

  await page.getByRole('searchbox', { name: 'Search' }).fill('Directory focus');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=Directory\+focus/);
  await page.getByRole('link', { name: 'Directory focus customer', exact: true }).click();
  await page.getByLabel('Contact name', { exact: true }).fill('Changed contact');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/customers\?.*q=Directory\+focus/);
  await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Changed contact');
  await expect(
    page.getByRole('link', { name: 'Directory focus customer', exact: true }),
  ).toBeFocused();

  await page.getByRole('searchbox', { name: 'Search' }).fill('No matching customer');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No customers match the current criteria.')).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters to find it' }).click();
  await expect(
    page.getByRole('link', { name: 'Directory focus customer', exact: true }),
  ).toBeFocused();
});

test('customer master lookup fills order details and dashboard shows product batch counts', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/orders');
  await page.getByRole('link', { name: 'New order', exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/app/orders' && url.searchParams.get('create') === 'order',
  );
  const newOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await expect(newOrderDialog).toBeVisible();
  await newOrderDialog.getByRole('link', { name: '+ Add customer', exact: true }).click();
  await page.getByLabel('Customer name', { exact: true }).fill('Dashboard customer');
  await page.getByLabel('Contact name', { exact: true }).fill('Sample contact');
  await page.getByLabel('Email', { exact: true }).fill('pickup@example.test');
  await page.getByLabel('Phone', { exact: true }).fill('555-0123');
  await page.getByLabel('Address', { exact: true }).fill('100 Test Road');
  await page.getByLabel('Customer notes', { exact: true }).fill('Call before pickup');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(page).toHaveURL(isCustomerAttachedOrderUrl);
  const savedCustomerId = new URL(page.url()).searchParams.get('customer');
  expect(savedCustomerId).toMatch(/^[a-f\d-]{36}$/u);
  const customerUrl = `/app/customers?customer=${savedCustomerId}`;
  await page.goto('/app/products');
  const options = page.locator('details.product-customer-options').first();
  await options.locator(':scope > summary').click();
  await options.getByText('+ Add customer option', { exact: true }).click();
  const addCustomerOption = options.locator('form:has(select[name="customer_id"]:not(:disabled))');
  await expect(addCustomerOption).toBeVisible();
  await addCustomerOption
    .locator('select[name="customer_id"]')
    .selectOption({ label: 'Dashboard customer' });
  await addCustomerOption.getByLabel('Option name', { exact: true }).fill('2-gallon bag');
  await addCustomerOption.getByRole('combobox', { name: /^Packaging/ }).selectOption('custom');
  await addCustomerOption
    .getByRole('combobox', { name: 'Sales unit', exact: true })
    .selectOption('bag');
  await addCustomerOption.getByLabel('Gallons per sales unit', { exact: true }).fill('2');
  await addCustomerOption.getByLabel('Price per unit (USD)', { exact: true }).fill('12.50');
  await addCustomerOption
    .getByRole('button', { name: 'Save customer option', exact: true })
    .click();
  await expect(
    options.getByText('Dashboard customer · 2-gallon bag · $12.50 / bag', { exact: true }),
  ).toBeVisible();
  await page.goto(customerUrl);
  await page.getByRole('link', { name: 'New order', exact: true }).click();
  const selectedCustomerOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await expect(selectedCustomerOrderDialog).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected customer details' })).toContainText(
    'Call before pickup',
  );
  await expect(page.getByRole('region', { name: 'Selected customer details' })).toContainText(
    '100 Test Road',
  );
  const pickupOn = futureCalendarDate(FUTURE_PICKUP_OFFSET_DAYS);
  await selectedCustomerOrderDialog.getByLabel('Customer pickup date').fill(pickupOn);
  await selectedCustomerOrderDialog
    .getByLabel('Customer order reference (optional)')
    .fill('Pickup example');
  await selectedCustomerOrderDialog
    .getByLabel('Preview Italian dressing', { exact: true })
    .fill('3');
  await expect(selectedCustomerOrderDialog.locator('.order-product-line')).toContainText(
    '$250.00 / 40-gallon batch',
  );
  await expect(page.locator('.order-product-line')).toContainText('60 ordering units · $750.00');
  await selectedCustomerOrderDialog
    .getByRole('button', { name: 'Save order & estimate ingredients' })
    .click();
  await expect(page).toHaveURL(/\/app\/orders\?order=/);
  await expect(page.getByRole('table', { name: 'Ordered products' })).toContainText('$750.00');
  await page.goto(customerUrl);
  await expect(page.locator('.worksheet-links')).toContainText(
    `Pickup ${formatCalendarDate(pickupOn)}`,
  );
  await expect(page.locator('.worksheet-links')).toContainText('Ordered');
  await page.goto('/app');
  const pickups = page.locator('.dashboard-pickups');
  await expect(pickups).toContainText('Dashboard customer');
  await expect(pickups).toContainText('Preview Italian dressing');
  await expect(pickups).toContainText('3 batches');
  await expect(pickups).toContainText('3 total batches');
  const demand = page.locator('.dashboard-demand');
  await expect(demand).toContainText('2 ingredients short');
  await expect(demand).toContainText('Preview garlic powder');
  await expect(demand).toContainText('Preview lemon juice');
  await demand.getByRole('button', { name: 'Generate supplier purchase drafts' }).click();
  await expect(demand.getByRole('status')).toContainText('1 purchase drafts created.');
  await expect(demand.getByRole('button')).toBeDisabled();
  await page.reload();
  await demand.getByRole('button', { name: 'Generate supplier purchase drafts' }).click();
  await expect(demand.getByRole('status')).toContainText('0 purchase drafts created.');
  await expect(demand.getByRole('status')).toContainText('Review existing draft');
  await expect(demand.getByRole('button')).toHaveText('Generate supplier purchase drafts');
  await expect(page.locator('main')).toContainText('Shipment confirmation is not available yet');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  await page.screenshot({ path: info.outputPath('operations-dashboard.png'), fullPage: true });
  expect(errors).toEqual([]);
});

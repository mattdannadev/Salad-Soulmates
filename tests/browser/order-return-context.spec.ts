import { expect, test } from './fixtures';

test('order creation cancel returns only to the validated workspace origin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/u);

  await page.goto('/app/orders?returnTo=%2Fapp&create=order');
  const newOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await expect(newOrderDialog).toBeVisible();
  await newOrderDialog.getByRole('button', { name: 'Close new order', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/app' && url.search === '');

  const nestedOrderCreate = encodeURIComponent('/app/orders?create=order');
  await page.goto(`/app/orders?returnTo=${nestedOrderCreate}&create=order`);
  await expect(newOrderDialog).toBeVisible();
  await newOrderDialog.getByRole('button', { name: 'Close new order', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/app/orders'
    && !url.searchParams.has('create')
    && !url.searchParams.has('returnTo')
    && Boolean(url.searchParams.get('draft')));
});

test('a saved order retains the validated workspace origin through its detail back action', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/u);

  await page.goto('/app/orders?returnTo=%2Fapp&create=order');
  const newOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await newOrderDialog.getByRole('combobox', { name: 'Customer', exact: true }).selectOption({
    label: 'Production customer',
  });
  await newOrderDialog.getByLabel('Customer order reference (optional)').fill('Workspace return');
  await newOrderDialog.getByLabel('Customer pickup date').fill('2026-10-01');
  await newOrderDialog.getByLabel('Preview Italian dressing', { exact: true }).fill('1');
  await newOrderDialog.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/app/orders'
    && Boolean(url.searchParams.get('order'))
    && url.searchParams.get('returnTo') === '/app');

  await page.getByRole('link', { name: 'Back to orders', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/app' && url.search === '');
});

test('a saved order retains its filtered and sorted directory context through detail', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/u);

  await page.goto('/app/orders?q=Preview&sort=pickup-oldest&create=order');
  const newOrderDialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await newOrderDialog.getByRole('combobox', { name: 'Customer', exact: true }).selectOption({
    label: 'Production customer',
  });
  await newOrderDialog.getByLabel('Customer order reference (optional)').fill('Directory return');
  await newOrderDialog.getByLabel('Customer pickup date').fill('2026-10-01');
  await newOrderDialog.getByLabel('Preview Italian dressing', { exact: true }).fill('1');
  await newOrderDialog.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/app/orders'
    && url.searchParams.get('q') === 'Preview'
    && url.searchParams.get('sort') === 'pickup-oldest'
    && Boolean(url.searchParams.get('order')));

  await page.getByRole('link', { name: 'Back to orders', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/app/orders'
    && url.searchParams.get('q') === 'Preview'
    && url.searchParams.get('sort') === 'pickup-oldest');
});

import { expect, test } from './fixtures';

test('saves a partial pickup draft, preserves it on reload, and gates physical confirmation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // The baseline app has no favicon; keep shipping runtime errors strict.
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
      errors.push(message.text());
    }
  });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/shipping');
  await expect(page.getByText('No customer orders yet.')).toBeVisible();
  const unavailableConfirmation = page.getByRole('button', { name: 'Confirm shipment / pickup — unavailable' });
  await expect(unavailableConfirmation).toBeDisabled();
  await expect(unavailableConfirmation).toHaveCSS('cursor', 'not-allowed');
  await page.goto('/app/orders');
  await page.getByLabel('Customer', { exact: true }).fill('Shipping customer');
  await page.getByLabel('Customer order reference (optional)').fill(`Shipping ${info.project.name}`);
  await page.getByLabel('Customer needs by').fill('2026-10-01');
  await page.getByLabel('Preview Italian dressing', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save order & estimate ingredients' }).click();
  await expect(page).toHaveURL(/\/app\/orders\?order=/);
  await page.getByRole('link', { name: 'Prepare shipment / pickup' }).click();
  await expect(page.getByRole('button', { name: 'Confirm shipment / pickup — unavailable' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Method', exact: true }).selectOption('Pickup');
  await page.getByLabel(/Preview Italian dressing ·/).fill('5');
  await page.getByLabel('Preparation notes').fill('Customer plans a partial pickup');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Shipping draft saved');
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.locator('article')).toContainText('5 case');
  await page.reload();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.locator('article')).toContainText('Customer plans a partial pickup');
  await expect(page.getByRole('button', { name: 'Confirm shipment / pickup — unavailable' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('shipping-draft.png'), fullPage: true, caret: 'initial' });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  expect(errors).toEqual([]);
});

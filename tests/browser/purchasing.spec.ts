import { expect, test } from '@playwright/test';

test('materials to supplier draft to partial receipt uses the actual database rules', async ({
  page,
  request,
}, info) => {
  const reset = await request.post('http://127.0.0.1:4010/rest/v1/test/purchasing-reset');
  expect(reset.ok()).toBe(true);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/materials');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingredient requirements');
  await expect(page.locator('main')).toContainText('Customer orders, automatic batch calculations and production start dates will be available');
  await page.getByLabel('Worksheet name').fill(`Materials ${info.project.name}`);
  await page.getByLabel('Ingredients needed by').fill('2026-10-01');
  await page.getByLabel('Preview Italian dressing · v1').fill('40');
  await page.getByRole('button', { name: 'Calculate & save requirements' }).click();
  await expect(page).toHaveURL(/\/app\/materials\?plan=/);
  await expect(page.getByRole('table')).toContainText('Preview garlic powder');
  await page.getByText('How these quantities were calculated', { exact: true }).click();
  await expect(page.locator('main')).toContainText('40');
  await page.screenshot({ path: info.outputPath('materials.png'), fullPage: true });
  await page.getByRole('link', { name: 'Review purchasing', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Purchasing', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create draft for Preview supplier' }).click();
  const draft = page.getByRole('article').filter({ hasText: 'Preview supplier' });
  await expect(draft).toContainText('60 lb');
  await draft.getByText('Update status', { exact: true }).click();
  await draft.getByLabel('External order reference').fill(`PO-${info.project.name}`);
  await draft.getByRole('button', { name: 'Save purchase status' }).click();
  await expect(draft.getByText('Confirmed', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('purchasing.png'), fullPage: true });
  await page.goto('/app/receiving');
  await page.getByLabel('Quantity received').fill('10');
  await page
    .getByLabel('Confirmed inbound order (optional)')
    .selectOption({ label: `PO-${info.project.name} · Preview garlic powder · 60 lb` });
  await page.getByLabel('Supplier lot').fill('TEST-LOT');
  await page.getByRole('button', { name: 'Post receipt & update inventory' }).click();
  await expect(page.getByRole('status')).toContainText('Receipt posted');
  await page.goto('/app/purchasing');
  await expect(
    page
      .getByRole('article')
      .getByRole('row')
      .filter({ hasText: 'Preview garlic powder' }),
  ).toContainText('50 lb');
  await expect(page.locator('body')).not.toContainText('Application error');
  expect(errors).toEqual([]);
  await request.post('http://127.0.0.1:4010/rest/v1/test/purchasing-reset');
});

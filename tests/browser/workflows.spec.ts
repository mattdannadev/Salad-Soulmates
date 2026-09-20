import { expect, test } from '@playwright/test';
import { z } from 'zod';

test('login validation, authenticated workflows, and sign-out', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to sign in' })).toBeVisible();
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
  await Promise.all([
    'Recipes', 'Products', 'Orders', 'Production planning', 'Team', 'Access requests', 'Settings',
  ].map(async (label) => {
    await expect(page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: label, exact: true })).toBeVisible();
  }));
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Recipes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Preview Italian recipe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preview garlic powder', exact: true })).toBeVisible();
  const stock = page.locator('details.ingredient-stock').first();
  await stock.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(stock.getByText('Recorded stock at your facility.', { exact: false })).toBeVisible();
  await stock.locator('summary').click();
  await expect(stock).not.toHaveAttribute('open', '');
  await page.screenshot({ path: info.outputPath('recipe-ingredients.png'), fullPage: true });
  await page.getByRole('link', { name: 'Preview garlic powder', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preview garlic powder');
  await expect(page.getByRole('heading', { name: 'On hand', exact: true })).toBeVisible();
  await expect(page.locator('details.ingredient-stock')).toContainText('On hand: Not recorded');
  await page.goBack();
  await page.getByRole('link', { name: 'v2 · Draft', exact: true }).click();
  await expect(page.getByText('No preparation sections recorded.', { exact: true })).toBeVisible();
  await page.goto('/app/products');
  await expect(page.getByText('Preview Italian dressing', { exact: true })).toBeVisible();
  await page.goto('/app/ingredients');
  await expect(page.getByRole('heading', { name: 'Ingredients library', exact: true })).toBeVisible();
  await page.goto('/app/inventory');
  await expect(
    page.getByRole('heading', { name: 'Ingredient inventory', exact: true }),
  ).toBeVisible();
  await page.goto('/app/receiving');
  await expect(page.getByText('No receipts yet', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Application error');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test('registration validation and callback without a code preserve safe routes', async ({
  page,
}) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/auth/callback?next=https://example.invalid');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/forgot-password');
  await expect(page.getByLabel('Email', { exact: false })).toBeVisible();
});

test('a lost inventory response preserves the request ID and entered values on retry', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/inventory');
  const reason = `Retry fixture ${info.project.name}`;
  await page.getByRole('combobox', { name: /^Ingredient\s*\*/ }).selectOption({ label: 'Preview garlic powder' });
  await page.getByLabel(/Quantity change/).fill('2');
  await page.getByLabel('Reason *', { exact: true }).fill(reason);
  let interrupted = false;
  await page.route('**/app/inventory', async (route) => {
    if (!interrupted && route.request().method() === 'POST') {
      interrupted = true;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Record inventory entry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Connection interrupted' })).toBeVisible();
  await expect(page.getByLabel(/Quantity change/)).toHaveValue('2');
  await expect(page.getByLabel('Reason *', { exact: true })).toHaveValue(reason);
  await page.getByRole('button', { name: 'Record inventory entry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record inventory entry', exact: true })).toBeEnabled();
  const response = await page.request.get('http://127.0.0.1:4010/test/inventory-attempts');
  const body: unknown = await response.json();
  const attempts = z.array(z.object({ request_id: z.uuid(), reason_note: z.string() })).parse(body)
    .filter((attempt) => attempt.reason_note === reason);
  expect(attempts).toHaveLength(2);
  expect(new Set(attempts.map((attempt) => attempt.request_id)).size).toBe(1);
});

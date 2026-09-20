import { expect, test } from './fixtures';

test('sidebar collapses to accessible icons and expands after navigation', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.brand strong')).toBeHidden();
  await expect(navigation.locator('.nav-label').first()).toBeHidden();
  await expect(navigation.getByRole('link', { name: 'Ingredients', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('sidebar-collapsed.png'), fullPage: true });
  await navigation.getByRole('link', { name: 'Ingredients', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/ingredients$/);
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Salad Soulmates — Home' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await expect(page.locator('.brand strong')).toBeVisible();
  await expect(navigation.locator('.nav-label').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('sidebar-expanded.png'), fullPage: true });
  await page.locator('#locale').selectOption('es');
  await page.getByRole('button', { name: 'Contraer navegación' }).click();
  await expect(page.getByRole('button', { name: 'Expandir navegación' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true })).toBeVisible();
});

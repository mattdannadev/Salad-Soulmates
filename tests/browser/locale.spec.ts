import { expect, test } from './fixtures';

test('language changes update navigation and dashboard and survive reload', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.locator('#locale').selectOption('es');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenido');
  await expect(page.locator('main')).toContainText('Próximas recogidas');
  await page.screenshot({ path: info.outputPath('dashboard-spanish.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('#locale')).toHaveValue('es');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenido');
  await page.goto('/worker');
  await expect(page.getByRole('heading', { name: 'Tu espacio de trabajo', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a administración', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Pedidos', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pedidos');

  await page.locator('#locale').selectOption('en');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Orders');
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
  await page.reload();
  await expect(page.locator('#locale')).toHaveValue('en');
  await expect(page.locator('main')).toContainText('Upcoming pickups');
  await page.screenshot({ path: info.outputPath('dashboard-english.png'), fullPage: true });

  await page.route('**/app', async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed');
    else await route.continue();
  });
  await page.locator('#locale').selectOption('es');
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save the language' })).toBeVisible();
  await expect(page.locator('#locale')).toHaveValue('en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
  await page.unroute('**/app');
  await page.locator('#locale').selectOption('es');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenido');
  await page.locator('#locale').selectOption('en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
  await page.goto('/worker');
  await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await expect(page.getByLabel('Your feedback *')).toBeVisible();
  await page.getByRole('button', { name: 'Close feedback', exact: true }).click();
  await page.getByRole('link', { name: 'Back to administration', exact: true }).click();
});

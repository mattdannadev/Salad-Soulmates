import { expect, test } from './fixtures';

test('language changes update navigation and dashboard and survive reload', async ({ page }, info) => {
  const navigationNames = info.project.name === 'phone'
    ? { en: 'Mobile navigation', es: 'Navegación móvil' }
    : { en: 'Main navigation', es: 'Navegación principal' };
  const navigation = (language: 'en' | 'es') => page.getByRole('navigation', {
    name: navigationNames[language],
  });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.locator('#locale').selectOption('es');
  await expect(navigation('es').getByRole('link', { name: 'Panel', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenido');
  await expect(page.locator('main')).toContainText('Próximas recogidas');
  await page.screenshot({ path: info.outputPath('dashboard-spanish.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('#locale')).toHaveValue('es');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenido');
  await page.goto('/worker');
  await expect(page.getByRole('heading', { name: 'Preparaciones de especias', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al panel', exact: true }).click();
  if (info.project.name === 'phone') {
    await expect(navigation('es')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const nav = document.querySelector('.mobile-navigation');
      const viewport = window.visualViewport;
      if (!nav || !viewport) return false;
      const bounds = nav.getBoundingClientRect();
      return document.documentElement.scrollWidth <= viewport.width
        && bounds.right <= viewport.width
        && bounds.bottom <= viewport.height;
    })).toBe(true);
    await navigation('es').getByRole('link', { name: 'Pedidos', exact: true }).click();
  } else {
    await navigation('es').getByText('Planificación de producción', { exact: true }).click();
    await navigation('es').getByRole('link', { name: 'Pedidos', exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pedidos');

  await page.locator('#locale').selectOption('en');
  await expect(navigation('en').getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Orders');
  await navigation('en').getByRole('link', { name: 'Dashboard', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Spice preparations', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await expect(page.getByLabel('Your feedback *')).toBeVisible();
  await page.getByRole('button', { name: 'Close feedback', exact: true }).click();
  await page.getByRole('link', { name: 'Back to dashboard', exact: true }).click();
});

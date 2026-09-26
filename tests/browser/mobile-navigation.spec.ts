import { expect, test } from './fixtures';

test('phone navigation keeps Dashboard prominent and opens every permitted section', async ({
  page,
}) => {
  await page.setViewportSize({ width: 457, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    mobileNavigation.getByRole('link', { name: 'Dashboard', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).not.toBeInViewport();

  await mobileNavigation.getByRole('button', { name: 'More sections' }).click();
  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(mainNavigation).toBeInViewport();
  await mainNavigation
    .locator('.nav-group')
    .filter({ hasText: 'Procurement & inventory' })
    .locator('summary')
    .click();
  await expect(mainNavigation.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();

  await mainNavigation.getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/inventory$/);
  await expect(mainNavigation).not.toBeInViewport();
  await expect(mobileNavigation.getByRole('button', { name: 'More sections' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('expanded navigation stays readable after a collapsed desktop rail becomes a drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await page.setViewportSize({ width: 602, height: 709 });
  await page.getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More sections' })
    .click();

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeInViewport();
  await expect(navigation.locator('.nav-group-label').first()).toBeVisible();
  await navigation
    .locator('.nav-group')
    .filter({ hasText: 'Procurement & inventory' })
    .locator('summary')
    .click();
  await expect(navigation.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.locator('.navigation-scrim')).toBeVisible();

  await page.locator('.navigation-scrim').click({ position: { x: 580, y: 100 } });
  await expect(navigation).not.toBeInViewport();
});

test('Production Planning opens worker preparations and returns to the dashboard', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 457, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More sections' }).click();
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const planning = navigation.locator('.nav-group').filter({ hasText: 'Production Planning' });
  await planning.locator('summary').click();
  await expect(planning.getByRole('link', { name: 'Orders' })).toBeVisible();
  await planning.getByRole('link', { name: 'Spice preparations' }).click();

  await expect(page).toHaveURL(/\/worker$/);
  await expect(page.getByRole('heading', { name: 'Spice preparations' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('worker-preparations.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to dashboard' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

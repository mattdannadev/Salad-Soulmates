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
  const inventory = mainNavigation.locator('.nav-group').filter({ hasText: 'Inventory' });
  await inventory.locator('summary').click();
  await expect(inventory.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();

  await inventory.getByRole('link', { name: 'Inventory', exact: true }).click();
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
  const inventory = navigation.locator('.nav-group').filter({ hasText: 'Inventory' });
  await inventory.locator('summary').click();
  await expect(inventory.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.locator('.navigation-scrim')).toBeVisible();

  await page.locator('.navigation-scrim').click({ position: { x: 580, y: 100 } });
  await expect(navigation).not.toBeInViewport();
});

test('Inventory groups receiving and purchase planning in the mobile drawer', async ({
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
  const inventory = navigation.locator('.nav-group').filter({ hasText: 'Inventory' });
  await inventory.locator('summary').click();
  await expect(inventory.getByRole('link', { name: 'Purchase planning' })).toBeVisible();
  await inventory.getByRole('link', { name: 'Receive deliveries' }).click();

  await expect(page).toHaveURL(/\/app\/receiving$/);
  await expect(page.getByText('No receipts yet', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('receiving-navigation.png'), fullPage: true });
});

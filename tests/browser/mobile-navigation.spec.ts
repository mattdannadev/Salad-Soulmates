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
  await expect(mainNavigation.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();

  await mainNavigation.getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/inventory$/);
  await expect(mainNavigation).not.toBeInViewport();
  await expect(mobileNavigation.getByRole('button', { name: 'More sections' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

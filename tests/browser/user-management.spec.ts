import { expect, test } from './fixtures';

test('access managers can search the responsive user directory and inspect a profile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/user-management/users');
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'User directory' })).toContainText(
    'Test Administrator',
  );
  await expect(page.getByRole('region', { name: 'User directory' })).toContainText(
    'admin@example.test',
  );
  await expect(page.getByRole('heading', { name: 'Invite a new user' })).toBeVisible();

  await page.getByLabel('Search users').fill('local test facility');
  await page.getByLabel('Sort by').selectOption('first_name');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=local(?:\+|%20)test(?:\+|%20)facility&sort=first_name/);
  await expect(page.getByText('1 of 1 users match “local test facility”.')).toBeVisible();

  await page.getByRole('link', { name: 'View profile' }).click();
  await expect(page.getByRole('heading', { name: 'Test Administrator' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete user', exact: true })).toBeDisabled();
  await expect(page.getByText('You cannot deactivate your own access.')).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  expect(errors).toEqual([]);
});

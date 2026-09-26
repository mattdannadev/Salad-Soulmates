import { expect, test } from './fixtures';

test('User Management navigation organizes admin screens and preserves legacy access links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const group = navigation.locator('.nav-group').filter({ hasText: 'User Management' });
  await expect(group.locator('summary')).toBeVisible();
  await group.locator('summary').click();
  await Promise.all(['Users', 'Profile Management', 'Access Requests', 'Login History']
    .map(async (label) => {
      await expect(group.getByRole('link', { name: label, exact: true })).toBeVisible();
    }));

  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invite a new user', exact: true })).toHaveCount(0);

  await page.goto('/app/user-management/users');
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invite a new user', exact: true })).toBeVisible();
  await expect(page.getByLabel('Invitation email preview')).toContainText('Set up your account');

  await page.goto('/app/access-requests');
  await expect(page).toHaveURL(/\/app\/user-management\/access-requests$/);
  await expect(page.getByRole('heading', { name: 'Access Requests', exact: true })).toBeVisible();

  await page.goto('/app/user-management/login-history');
  await expect(page.getByRole('heading', { name: 'Login History', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Test Administrator' })
    .filter({ hasText: 'Signed in' }).first()).toBeVisible();
});

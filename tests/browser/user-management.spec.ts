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

  const directoryToolbar = page.getByRole('region', { name: 'Search users' });
  const mobileFilterDisclosure = directoryToolbar.locator('details');
  const openMobileFilters = async () => {
    if (await mobileFilterDisclosure.isVisible()) {
      await mobileFilterDisclosure.locator('summary').click();
    }
  };

  await directoryToolbar.getByRole('searchbox').fill('local test facility');
  await directoryToolbar.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('local test facility');
  await openMobileFilters();
  await directoryToolbar.getByRole('combobox', { name: 'Sort by' }).selectOption('first_name');
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('first_name');
  await expect(directoryToolbar).toContainText('1 results');

  const administratorLink = page.getByRole('link', { name: 'Test Administrator', exact: true });
  await expect
    .poll(async () => {
      const href = await administratorLink.getAttribute('href');
      return href
        ? new URL(href, 'https://salad-soulmates.test').searchParams.get('returnTo')
        : null;
    })
    .toBe('/app/user-management/users?q=local+test+facility&sort=first_name');
  await administratorLink.click();
  await expect(page.getByRole('heading', { name: 'Test Administrator' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to users' }).click();
  await expect
    .poll(() => {
      const returnedDirectory = new URL(page.url());
      return [
        returnedDirectory.searchParams.get('q'),
        returnedDirectory.searchParams.get('sort'),
        returnedDirectory.searchParams.get('focusRow'),
      ];
    })
    .toEqual(['local test facility', 'first_name', '00000000-0000-4000-8000-000000000001']);
  await expect(directoryToolbar.getByRole('searchbox')).toHaveValue('local test facility');
  await expect(administratorLink).toBeFocused();
  await openMobileFilters();
  await expect(directoryToolbar.getByRole('combobox', { name: 'Sort by' })).toHaveValue(
    'first_name',
  );
  await page.getByRole('link', { name: 'Test Administrator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'User profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deactivate user', exact: true })).toBeDisabled();
  await expect(page.getByText('You cannot deactivate your own access.')).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  expect(errors).toEqual([]);
});

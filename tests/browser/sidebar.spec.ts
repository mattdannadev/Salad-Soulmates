import { expect, test } from './fixtures';

test('short desktop sidebar scrolls independently to the final navigation links', async ({ page }) => {
  await page.setViewportSize({ width: 866, height: 738 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const sidebar = page.locator('.sidebar');
  const finalLink = sidebar.getByRole('link').last();
  await expect(sidebar).toBeVisible();
  const before = await page.evaluate(() => window.scrollY);
  await sidebar.hover();
  await page.mouse.wheel(0, 2000);
  await expect(finalLink).toBeInViewport();
  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await finalLink.click();
  await expect(page).not.toHaveURL(/\/app$/);
});

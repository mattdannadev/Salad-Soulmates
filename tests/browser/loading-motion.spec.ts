import { expect, test } from './fixtures';

test('route loading stays visible without animation when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await page.evaluate(() => {
    const loading = document.createElement('div');
    loading.className = 'route-loading';
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-label', 'Loading page');
    loading.innerHTML = [
      '<span class="route-progress"></span>',
      '<span class="skeleton skeleton-title"></span>',
    ].join('');
    document.body.append(loading);
  });

  const loading = page.getByRole('status', { name: 'Loading page' });
  await expect(loading).toBeVisible();
  await expect(loading.locator('.skeleton')).toBeVisible();
  const animationNames = {
    entrance: await loading.evaluate((element) => getComputedStyle(element).animationName),
    progress: await loading
      .locator('.route-progress')
      .evaluate((element) => getComputedStyle(element, '::after').animationName),
    shimmer: await loading
      .locator('.skeleton')
      .evaluate((element) => getComputedStyle(element).animationName),
  };
  expect(animationNames).toEqual({ entrance: 'none', progress: 'none', shimmer: 'none' });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => loading.evaluate((element) => getComputedStyle(element).animationName))
    .toBe('page-in');
});

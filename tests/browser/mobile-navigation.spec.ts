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
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More sections' })
    .click();

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeInViewport();
  await expect(navigation.locator('.nav-section-label').first()).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.locator('.navigation-scrim')).toBeVisible();

  await page.locator('.navigation-scrim').click({ position: { x: 580, y: 100 } });
  await expect(navigation).not.toBeInViewport();
});

test('Inventory keeps receiving discoverable while purchasing stays contextual', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 457, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More sections' })
    .click();
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link', { name: 'Purchase planning' })).toHaveCount(1);
  await navigation.getByRole('link', { name: 'Receive deliveries' }).click();

  await expect(page).toHaveURL(/\/app\/receiving$/);
  await expect(page.getByText('No receipts yet', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('receiving-navigation.png'), fullPage: true });
});

test('closed mobile drawer leaves the tab order and opens as a keyboard dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const drawer = page.locator('.sidebar');
  const more = page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More sections' });
  await expect(drawer).toBeHidden();
  await more.focus();
  await page.keyboard.press('Tab');
  await expect(drawer.locator('.mobile-drawer-close')).not.toBeFocused();

  await more.click();
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  const close = drawer.getByRole('button', { name: 'Close navigation' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.locator('a:visible, button:visible').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(more).toBeFocused();
});

test('390px shell controls stay inside the viewport and the drawer dismisses by scrim and route', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const toggle = page.getByRole('button', { name: 'Open navigation' });
  const bottomNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  const feedback = page.getByRole('button', { name: 'Feedback', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = window.visualViewport;
        const toggleRect = document
          .querySelector('.mobile-navigation-toggle')
          ?.getBoundingClientRect();
        const bottomRect = document.querySelector('.mobile-navigation')?.getBoundingClientRect();
        const feedbackRect = document.querySelector('.feedback-button')?.getBoundingClientRect();
        if (!viewport || !toggleRect || !bottomRect || !feedbackRect) return false;
        return (
          document.documentElement.scrollWidth <= viewport.width &&
          toggleRect.width >= 48 &&
          toggleRect.height >= 48 &&
          toggleRect.left >= 0 &&
          toggleRect.right <= viewport.width &&
          bottomRect.left >= 0 &&
          bottomRect.right <= viewport.width &&
          bottomRect.bottom <= viewport.height &&
          feedbackRect.left >= 0 &&
          feedbackRect.right <= viewport.width &&
          feedbackRect.bottom <= bottomRect.top
        );
      }),
    )
    .toBe(true);

  await toggle.click();
  const drawer = page.locator('.sidebar');
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = window.visualViewport;
        const drawerRect = document.querySelector('.sidebar')?.getBoundingClientRect();
        const scrimRect = document.querySelector('.navigation-scrim')?.getBoundingClientRect();
        if (!viewport || !drawerRect || !scrimRect) return false;
        return (
          drawerRect.left >= 0 &&
          drawerRect.right <= viewport.width &&
          drawerRect.bottom <= viewport.height &&
          scrimRect.left >= 0 &&
          scrimRect.right <= viewport.width &&
          scrimRect.bottom <= viewport.height
        );
      }),
    )
    .toBe(true);
  await page.locator('.navigation-scrim').click({ position: { x: 380, y: 100 } });
  await expect(drawer).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Inventory', exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/inventory$/);
  await expect(drawer).toBeHidden();
  await expect(bottomNavigation.getByRole('button', { name: 'More sections' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await feedback.click();
  await expect(page.getByRole('button', { name: 'Close feedback' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = window.visualViewport;
        const bounds = document.querySelector('.feedback-drawer')?.getBoundingClientRect();
        return (
          !!viewport &&
          !!bounds &&
          bounds.left >= 0 &&
          bounds.right <= viewport.width &&
          bounds.bottom <= viewport.height
        );
      }),
    )
    .toBe(true);
});

test('Spanish phone drawer exposes labeled keyboard controls at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.locator('#locale').selectOption('es');

  const toggle = page.getByRole('button', { name: 'Abrir navegación' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Navegación principal' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Cerrar navegación' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación móvil' })
      .getByRole('button', { name: 'Más secciones' }),
  ).toBeVisible();
});

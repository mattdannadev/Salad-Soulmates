import { expect, test } from './fixtures';

test('feedback dialog has a description and returns focus after close or Escape', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const opener = page.getByRole('button', { name: 'Feedback', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Share your thoughts' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/current page is included automatically/i);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();

  await opener.click();
  await dialog.getByRole('button', { name: 'Close feedback' }).click();
  await expect(opener).toBeFocused();
});

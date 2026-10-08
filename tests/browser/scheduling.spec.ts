import { expect, test } from './fixtures';

test('manager schedule loads the accessible board and supports scheduler-owned assignment creation', async ({
  page,
}, info) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/scheduling?surface=calendar');
  await expect(
    page.getByRole('heading', { name: 'Production Planning', exact: true }),
  ).toBeVisible();
  const calendar = page.locator('#schedule-calendar');
  const scheduleBoard = calendar.getByRole('region', { name: 'Work schedule', exact: true });
  await expect(calendar).toBeVisible();
  await expect(scheduleBoard).toBeVisible();

  const addWork = scheduleBoard.getByRole('button', { name: 'Add work', exact: true });
  await expect(addWork).toBeEnabled();
  await addWork.click();
  const dialog = page.getByRole('dialog', { name: 'Create Work Order', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/Choose the task, dates, times, and employees/);
  await expect(dialog.getByRole('combobox', { name: 'Task', exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Start', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('End', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Work details', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(addWork).toBeFocused();

  await addWork.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(addWork).toBeFocused();
  await expect(scheduleBoard).toBeVisible();
  await page.screenshot({ path: info.outputPath('scheduling-board.png'), fullPage: true });
});

test('manager can switch repeatedly between the production plan and execution calendar', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/scheduling');
  const productionPlanButton = page.getByRole('link', { name: 'Production plan', exact: true });
  const executionCalendarButton = page.getByRole('link', {
    name: 'Execution calendar',
    exact: true,
  });
  const scheduleBoard = page.getByRole('region', { name: 'Work schedule', exact: true });

  await expect(scheduleBoard).toBeVisible();
  await expect(productionPlanButton).toHaveAttribute('aria-current', 'page');

  const switchToCalendarAndBack = async () => {
    await executionCalendarButton.click();
    await expect(page).toHaveURL(/surface=calendar/);
    await expect(scheduleBoard).toBeVisible();
    await expect(executionCalendarButton).toHaveAttribute('aria-current', 'page');

    await productionPlanButton.click();
    await expect(page).not.toHaveURL(/surface=calendar/);
    await expect(scheduleBoard).toBeVisible();
    await expect(productionPlanButton).toHaveAttribute('aria-current', 'page');
  };
  // Repeat the round trip to catch stale state and widget cleanup failures.
  await switchToCalendarAndBack();
  await switchToCalendarAndBack();
});

test('production-plan work can be saved, reloaded, and deleted through confirmation', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/scheduling');

  const scheduleBoard = page.getByRole('region', { name: 'Work schedule', exact: true });
  await scheduleBoard.getByRole('button', { name: 'Add work', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Work Order', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/Choose the task, dates, and employees/);
  await expect(dialog.getByLabel('Start date', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('End date', { exact: true })).toBeVisible();
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Assignment saved.', { exact: true })).toBeVisible();

  const mixingWork = scheduleBoard.getByRole('listitem').filter({ hasText: 'Mixing' });
  await expect(mixingWork).toHaveCount(1);
  await expect(mixingWork).toBeVisible();

  await page.reload();
  await expect(scheduleBoard).toBeVisible();
  await expect(mixingWork).toHaveCount(1);
  await mixingWork.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit work', exact: true });
  await expect(edit).toBeVisible();
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await mixingWork.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete work order', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Assignment deleted.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(mixingWork).toHaveCount(0);
});

test('schedule controls stay focused and reflow on narrow screens', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  // Previous filter links must not silently hide work after their controls are removed.
  await page.goto(
    '/app/scheduling?types=cleaning&staffing=unassigned&status=completed&publication=draft',
  );
  const controls = page.getByLabel('Calendar controls', { exact: true });
  const focus = page.getByRole('group', { name: 'Calendar focus', exact: true });
  await expect(focus.getByRole('combobox')).toHaveCount(2);
  await expect(focus.getByRole('combobox', { name: 'Customer', exact: true })).toBeVisible();
  await expect(focus.getByRole('combobox', { name: 'Order', exact: true })).toBeVisible();
  await expect(controls.getByRole('link', { name: 'Production plan', exact: true })).toBeVisible();
  await expect(
    controls.getByRole('link', { name: 'Execution calendar', exact: true }),
  ).toBeVisible();
  await expect(controls.getByRole('button')).toHaveCount(3);
  await expect(controls.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
  await expect(
    controls.getByRole('button', { name: 'Record time off', exact: true }),
  ).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Publish week', exact: true })).toBeVisible();
  await expect(
    controls.getByRole('link', { name: 'Execution calendar', exact: true }),
  ).not.toHaveAttribute('href', /types=|staffing=|status=|publication=/);

  await page.setViewportSize({ width: 390, height: 844 });
  const controlsFit = await controls.evaluate(
    (element) => element.scrollWidth <= element.clientWidth,
  );
  expect(controlsFit).toBe(true);
  await controls.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(
    controls.getByRole('button', { name: 'Exit fullscreen', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(controls.getByRole('button', { name: 'Fullscreen', exact: true })).toBeFocused();
});

test('execution calendar focus can be cleared in one action', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/scheduling?surface=calendar');

  const focus = page.getByRole('group', { name: 'Calendar focus', exact: true });
  const customer = focus.getByRole('combobox', { name: 'Customer', exact: true });
  await customer.selectOption({ label: 'Production customer' });
  const showAll = focus.getByRole('button', { name: 'Show all', exact: true });
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(customer).toHaveValue('');
  await expect(showAll).toHaveCount(0);
});

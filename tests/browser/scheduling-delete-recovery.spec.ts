import { expect, test } from './fixtures';

test('a stale work deletion closes its confirmation and keeps the delete action focused', async ({
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
  const createDialog = page.getByRole('dialog', { name: 'Create Work Order', exact: true });
  await createDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Assignment saved.', { exact: true })).toBeVisible();

  const mixingWork = scheduleBoard.getByRole('listitem').filter({ hasText: 'Mixing' });
  await expect(mixingWork).toHaveCount(1);
  const secondPage = await page.context().newPage();
  try {
    await secondPage.goto('/app/scheduling');
    const concurrentWork = secondPage
      .getByRole('region', { name: 'Work schedule', exact: true })
      .getByRole('listitem')
      .filter({ hasText: 'Mixing' });
    await concurrentWork.getByRole('button', { name: 'Edit', exact: true }).click();
    const editDialog = secondPage.getByRole('dialog', { name: 'Edit work', exact: true });
    await editDialog.getByLabel('Work details', { exact: true }).fill('Updated elsewhere.');
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(secondPage.getByText('Assignment saved.', { exact: true })).toBeVisible();

    const deleteWork = mixingWork.getByRole('button', { name: 'Delete', exact: true });
    await deleteWork.click();
    const confirmation = page.getByRole('dialog', { name: 'Delete work order', exact: true });
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    const staleStatus = page
      .getByRole('status')
      .filter({ hasText: 'Schedule changed; reload and try again' });
    await expect(staleStatus).toBeVisible();
    const reloadSchedule = page.getByRole('button', { name: 'Reload schedule', exact: true });
    await expect(reloadSchedule).toBeVisible();
    await expect(deleteWork).toBeFocused();

    await deleteWork.click();
    await expect(confirmation).toBeVisible();
    await expect(staleStatus).not.toBeVisible();
    await expect(reloadSchedule).not.toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(deleteWork).toBeFocused();

    await deleteWork.click();
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(reloadSchedule).toBeVisible();
    await reloadSchedule.click();
    await expect(staleStatus).not.toBeVisible();

    await deleteWork.click();
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Assignment deleted.', { exact: true })).toBeVisible();
    await expect(mixingWork).toHaveCount(0);
  } finally {
    await secondPage.close();
  }
});

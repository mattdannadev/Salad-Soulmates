import { expect, test } from './fixtures';

const ingredientId = '00000000-0000-4000-8000-000000000100';

async function createConfirmedPurchase(page: import('@playwright/test').Page) {
  await page.goto(`/app/purchasing?ingredient=${ingredientId}`);
  await page.getByLabel('Expected delivery').fill('2026-10-01');
  await page.getByLabel(/Whole packs \(0 skips this ingredient\)/).fill('1');
  await page.getByRole('button', { name: 'Create purchase order for Preview supplier' }).click();
  const purchase = page.getByRole('article').filter({ hasText: 'Confirmed' }).first();
  await expect(purchase).toBeVisible();
  return purchase.locator('strong').first().innerText();
}

test('receives multiple same-supplier POs with source-lot splits and package labels', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const firstReference = await createConfirmedPurchase(page);
  const secondReference = await createConfirmedPurchase(page);
  await page.goto('/receiving');
  await expect(page.getByRole('heading', { name: 'Receive Inventory' })).toBeVisible();
  await page.getByRole('checkbox', { name: new RegExp(firstReference) }).check();
  await page.getByRole('checkbox', { name: new RegExp(secondReference) }).check();

  const firstOrder = page.getByRole('group', { name: firstReference });
  const secondOrder = page.getByRole('group', { name: secondReference });
  await expect(firstOrder.getByRole('row').filter({ hasText: 'Preview garlic powder' }))
    .toContainText('30 lb');
  await firstOrder.getByLabel('Actual received (lb)').fill('10');
  await firstOrder.getByLabel('Supplier lot').fill(' LOT-A ');
  await firstOrder.getByLabel('Package 1 · quantity (lb)').fill('10');
  await firstOrder.getByRole('button', { name: 'Add another source lot' }).click();
  await firstOrder.getByLabel('Actual received (lb)').nth(1).fill('20');
  await firstOrder.getByLabel('Supplier lot').nth(1).fill('LOT-B');
  await firstOrder.getByLabel('Package 1 · quantity (lb)').nth(1).fill('20');
  await secondOrder.getByRole('button', { name: 'Fill full outstanding' }).click();
  await page.getByLabel('Delivery reference').fill('TRUCK-RECEIVE-1');

  await page.screenshot({ path: info.outputPath('purchase-receiving-entry.png'), fullPage: true });
  await page.getByRole('button', { name: 'Receive inventory & create labels' }).click();
  await expect(page.getByRole('status')).toContainText('Delivery received');
  await expect(page.getByRole('link', { name: 'View this receipt and print labels' }))
    .toBeVisible();
  await expect(page.getByRole('heading', { name: 'No open purchase orders to receive' }))
    .toBeVisible();
  const receipt = page.locator('#receipt-history article').filter({ hasText: 'TRUCK-RECEIVE-1' });
  await expect(receipt).toContainText(firstReference);
  await expect(receipt).toContainText(secondReference);
  await expect(receipt.getByRole('row')).toHaveCount(4);
  await page.screenshot({ path: info.outputPath('purchase-receiving-complete.png'), fullPage: true });

  await page.getByRole('link', { name: 'View this receipt and print labels' }).click();
  await expect(page.locator('.package-label')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect(errors).toEqual([]);
});

import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './fixtures';

const fixtureApi = 'http://127.0.0.1:4010/rest/v1';

async function prepareDelivery(page: Page, request: APIRequestContext) {
  const purchaseId = randomUUID();
  const created = await request.post(`${fixtureApi}/rpc/create_purchase_draft`, {
    data: {
      payload: {
        id: purchaseId,
        kind: 'standalone',
        material_plan_id: null,
        supplier_id: '00000000-0000-4000-8000-000000000200',
        expected_on: '2026-10-01',
        lines: [{
          ingredient_id: '00000000-0000-4000-8000-000000000100',
          supplier_item_id: '00000000-0000-4000-8000-000000000210',
          purchase_units: 1,
          override_reason: 'Disposable recovery regression',
        }],
      },
    },
  });
  expect(created.ok()).toBe(true);
  const purchaseReference = `PO-${purchaseId.replaceAll('-', '').slice(-8).toUpperCase()}`;

  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/receiving');
  await page.getByRole('checkbox', { name: new RegExp(purchaseReference) }).check();
  const order = page.getByRole('group', { name: purchaseReference });
  await order.getByLabel('Actual received (lb)').fill('10');
  await order.getByLabel('Package 1 · quantity (lb)').fill('10');
  return order;
}

test('recovers a committed delivery after a lost response and reload without posting twice', async ({
  page, request,
}, info) => {
  const order = await prepareDelivery(page, request);

  // The server commits first; only its acknowledgement is lost in transit.
  await page.route('**/receiving', async (route) => {
    if (!route.request().headers()['next-action']) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Receive inventory & create labels' }).click();
  await expect(page.getByRole('button', { name: 'Retry same delivery' })).toBeVisible();
  await expect(order.getByLabel('Actual received (lb)')).toBeDisabled();

  const lineSchema = z.array(z.object({ id: z.uuid(), quantity: z.number() }));
  const beforeRetry = lineSchema.parse(await (await request.get(
    `${fixtureApi}/inventory_receipt_lines`,
  )).json());
  expect(beforeRetry).toHaveLength(1);
  expect(beforeRetry[0]?.quantity).toBe(10);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry same delivery' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('pending-delivery-recovery.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry same delivery' }).click();
  await expect(page.getByRole('status')).toContainText('Delivery received');
  const afterRetry = lineSchema.parse(await (await request.get(
    `${fixtureApi}/inventory_receipt_lines`,
  )).json());
  expect(afterRetry).toEqual(beforeRetry);
  const receipts = z.array(z.object({ id: z.uuid() })).parse(await (await request.get(
    `${fixtureApi}/inventory_receipts`,
  )).json());
  expect(receipts).toHaveLength(1);
  await page.getByRole('link', { name: 'View this receipt and print labels' }).click();
  await expect(page.locator('.package-label')).toHaveCount(1);
});

test('keeps a committed receipt visible when browser retry-storage cleanup fails', async ({
  page, request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepareDelivery(page, request);
  await page.evaluate(() => {
    Object.defineProperty(window.sessionStorage, 'removeItem', {
      configurable: true,
      value: () => {
        throw new DOMException('Simulated storage cleanup failure', 'SecurityError');
      },
    });
  });
  await page.getByRole('button', { name: 'Receive inventory & create labels' }).click();
  await expect(page.getByRole('status')).toContainText('Delivery received');
  await expect(page.getByRole('link', { name: 'View this receipt and print labels' })).toBeVisible();
  expect(errors).toEqual([]);

  // Reload removes the injected failure. The persisted token still resolves the same receipt.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry same delivery' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same delivery' }).click();
  await expect(page.getByRole('status')).toContainText('Delivery received');
  const receipts = z.array(z.object({ id: z.uuid() })).parse(await (await request.get(
    `${fixtureApi}/inventory_receipts`,
  )).json());
  expect(receipts).toHaveLength(1);
  await page.getByRole('link', { name: 'View this receipt and print labels' }).click();
  await expect(page.locator('.package-label')).toHaveCount(1);
});

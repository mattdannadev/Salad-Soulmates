import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { workPlanVersionsSchema } from '../../src/domain/work-plans';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/settings/work-plans');
}

async function createPlan(page: Page, name: string, code: string) {
  await page.getByRole('button', { name: 'Create Work Plan', exact: true }).click();
  await page.getByLabel('Work Plan name', { exact: true }).fill(name);
  await page.getByLabel('Stable code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Version editor', exact: true })).toBeVisible();
}

test('Spanish Work Plan copy preserves owner-entered data', async ({ page, request }) => {
  const locale = await request.patch(
    'http://127.0.0.1:4010/rest/v1/profiles?id=eq.00000000-0000-4000-8000-000000000001',
    { data: { preferred_locale: 'es' } },
  );
  expect(locale.ok()).toBe(true);
  await signIn(page);
  await page.getByRole('button', { name: 'Crear plan de trabajo', exact: true }).click();
  await page.getByLabel('Nombre del plan de trabajo', { exact: true }).fill('Owner workflow name');
  await page.getByLabel('Código permanente', { exact: true }).fill('owner_workflow');
  await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Editor de versiones', exact: true });
  await expect(editor.getByRole('heading', { name: 'Owner workflow name', exact: true })).toBeVisible();
  await expect(editor.getByLabel('Opcional al aplicar', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Volver a planes de trabajo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Versiones de planes de trabajo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Abrir versión 1 · Owner workflow name', exact: true,
  })).toBeVisible();
  const listed = await request.post('http://127.0.0.1:4010/rest/v1/rpc/list_work_plan_versions', { data: {} });
  expect(workPlanVersionsSchema.parse(await listed.json())[0]?.name).toBe('Owner workflow name');
});

test('focused editor preserves every step, dependency and optional flag through save, release and clone', async ({ page, request }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page);
  await createPlan(page, 'Daily production workflow', 'daily_production');
  const editor = page.getByRole('region', { name: 'Version editor', exact: true });
  await editor.getByLabel('Step title', { exact: true }).fill('Prepare ingredients');
  await editor.getByLabel('Optional when applied', { exact: true }).check();
  await editor.getByRole('button', { name: 'Add step', exact: true }).click();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveCount(1);
  await expect(editor.getByRole('button', { name: 'Release version', exact: true })).toBeDisabled();
  await editor.getByLabel('Step title', { exact: true }).fill('Mix prepared ingredients');
  await editor.getByLabel('Instructions', { exact: true }).fill('Use only eligible, unconsumed prep output.');
  await editor.getByRole('button', { name: 'Move earlier', exact: true }).click();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveValue('Mix prepared ingredients');
  await editor.locator('summary').filter({ hasText: 'Step dependencies' }).click();
  await editor.getByLabel('Must finish first').selectOption('complete');
  await editor.getByLabel('Then enables').selectOption('step_2');
  await editor.getByRole('button', { name: 'Add dependency', exact: true }).click();
  await expect(editor.getByText('complete → step_2', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Work Plan draft saved.', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Release version', exact: true })).toBeEnabled();
  await page.reload();
  const search = page.getByLabel('Search Work Plan versions', { exact: true });
  await search.fill('Daily production');
  const open = page.getByRole('button', { name: 'Open version 1 · Daily production workflow', exact: true });
  await expect(open).toBeVisible();
  await expect(page.getByText('No matching results. Try another search or filter.', {
    exact: true,
  })).toHaveCount(0);
  await expect(page.getByText('1 records', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('directory.png'),
    fullPage: false,
    scale: 'css',
    style: 'nextjs-portal { display: none !important; }',
  });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(editor.getByRole('heading', { name: 'Daily production workflow', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await expect(search).toHaveValue('Daily production');
  await page.keyboard.press('Enter');
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveValue('Mix prepared ingredients');
  await expect(editor.getByLabel('Instructions', { exact: true })).toHaveValue('Use only eligible, unconsumed prep output.');
  await editor.getByRole('button', { name: 'Edit step · Prepare ingredients', exact: true }).click();
  await expect(editor.getByLabel('Optional when applied', { exact: true })).toBeChecked();
  await editor.getByRole('button', { name: 'Edit step · Mix prepared ingredients', exact: true }).click();
  await editor.getByLabel('Step title', { exact: true }).fill('   ');
  await editor.getByRole('button', { name: 'Edit step · Prepare ingredients', exact: true }).click();
  await expect(editor.getByLabel('Step title', { exact: true })).toBeFocused();
  await expect(page.getByText('Complete the step title before moving to another step.', { exact: true })).toBeVisible();
  await editor.getByLabel('Step title', { exact: true }).fill('Mix prepared ingredients');
  await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Work Plan draft saved.', { exact: true })).toBeVisible();
  const save = editor.getByRole('button', { name: 'Save draft changes', exact: true });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  expect(await save.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const target = document.elementFromPoint(centerX, centerY);
    return target !== null && button.contains(target);
  })).toBe(true);
  await editor.getByRole('heading', { name: 'Daily production workflow', exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('work-plan-editor.png'),
    fullPage: false,
    scale: 'css',
    style: 'nextjs-portal { display: none !important; }',
  });
  await editor.getByLabel('Step title', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('work-plan-step-editor.png'),
    fullPage: false,
    scale: 'css',
    style: 'nextjs-portal { display: none !important; }',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const listedResponse = await request.post('http://127.0.0.1:4010/rest/v1/rpc/list_work_plan_versions', { data: {} });
  const [savedVersion] = workPlanVersionsSchema.parse(await listedResponse.json());
  expect(savedVersion?.steps.map((step) => step.title))
    .toEqual(['Mix prepared ingredients', 'Prepare ingredients']);
  expect(savedVersion?.steps.find((step) => step.key === 'complete')?.optional).toBe(true);
  expect(savedVersion?.dependencies).toEqual([{ predecessor_key: 'complete', successor_key: 'step_2' }]);
  await editor.getByRole('button', { name: 'Release version', exact: true }).click();
  await expect(page.getByText('Work Plan version released.', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save draft changes', exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveCount(0);
  await expect(editor.getByText('Work Order · Optional · Not required', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Create new version', exact: true }).click();
  await expect(page.getByText('New Work Plan draft created.', { exact: true })).toBeVisible();
  await expect(editor.getByText('daily_production / Version 2', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Edit step · Prepare ingredients', exact: true }).click();
  await expect(editor.getByLabel('Optional when applied', { exact: true })).toBeChecked();
  await editor.locator('summary').filter({ hasText: 'Version comparison' }).click();
  await expect(editor.getByRole('region', { name: 'Version comparison', exact: true })).toBeVisible();
  await editor.locator('summary').filter({ hasText: 'Step dependencies' }).click();
  await expect(editor.getByText('complete → step_2', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Remove link', exact: true }).click();
  await expect(editor.getByText('0 added and 1 removed dependencies.', { exact: true })).toBeVisible();
  await editor.getByLabel('Must finish first').selectOption('step_2');
  await editor.getByLabel('Then enables').selectOption('complete');
  await editor.getByRole('button', { name: 'Add dependency', exact: true }).click();
  await editor.getByLabel('Must finish first').selectOption('complete');
  await editor.getByLabel('Then enables').selectOption('step_2');
  await editor.getByRole('button', { name: 'Add dependency', exact: true }).click();
  await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Enter a valid Work Plan definition.', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveValue('Prepare ingredients');
  await editor.getByRole('button', { name: 'Remove link', exact: true }).first().click();
  await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Work Plan draft saved.', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('refreshed stale saves and permission loss retain local edits with actionable feedback', async ({ page, request }) => {
  await signIn(page);
  await createPlan(page, 'Recovery workflow', 'recovery_workflow');
  const editor = page.getByRole('region', { name: 'Version editor', exact: true });
  await editor.getByLabel('Step title', { exact: true }).fill('Local unsaved title');
  const response = await request.post('http://127.0.0.1:4010/rest/v1/rpc/list_work_plan_versions', { data: {} });
  const [version] = workPlanVersionsSchema.parse(await response.json());
  if (!version) throw new Error('Expected the created version');
  const remoteSave = await request.post('http://127.0.0.1:4010/rest/v1/rpc/save_work_plan_draft', {
    data: {
      payload: {
        version_id: version.id,
        revision: version.revision,
        name: version.name,
        steps: version.steps.map((step) => ({
          key: step.key,
          title: 'Remote saved title',
          materialization_policy: step.materialization_policy,
          task_template: {
            instructions: step.instructions,
            requires_verification: step.requires_verification,
            optional: step.optional,
          },
        })),
        dependencies: version.dependencies,
      },
    },
  });
  expect(remoteSave.ok()).toBe(true);
  await editor.getByRole('button', { name: 'Back to Work Plans', exact: true }).click();
  await createPlan(page, 'Refresh workflow', 'refresh_workflow');
  await editor.getByRole('button', { name: 'Back to Work Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Open version 1 · Recovery workflow', exact: true }).click();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveValue('Local unsaved title');
  await expect(editor.getByRole('button', { name: 'Release version', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Submit for review', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Work Plan version changed; reload and try again.', { exact: true }).first()).toBeVisible();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveValue('Local unsaved title');
  const denial = await request.post('http://127.0.0.1:4010/rest/v1/test/work-plan-permission', { data: { allowed: false } });
  expect(denial.ok()).toBe(true);
  await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Work Plan management access is required.', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveValue('Local unsaved title');
  const stored = await request.post('http://127.0.0.1:4010/rest/v1/rpc/list_work_plan_versions', { data: {} });
  const storedVersion = workPlanVersionsSchema.parse(await stored.json())
    .find((item) => item.id === version.id);
  expect(storedVersion?.steps[0]?.title).toBe('Remote saved title');
  await page.reload();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole('button', { name: 'Create Work Plan', exact: true })).toHaveCount(0);
});

test('review and retirement preserve read-only evidence and deliberate keyboard confirmation', async ({ page, request }) => {
  await signIn(page);
  await createPlan(page, 'Lifecycle workflow', 'lifecycle_workflow');
  const editor = page.getByRole('region', { name: 'Version editor', exact: true });
  await editor.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Return to draft', exact: true })).toBeVisible();
  await expect(editor.getByLabel('Step title', { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Return to draft', exact: true }).click();
  await expect(editor.getByLabel('Step title', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Return to draft', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Release version', exact: true }).click();
  const retire = editor.getByRole('button', { name: 'Retire version', exact: true });
  await expect(retire).toBeVisible();
  await retire.click();
  const confirmation = page.getByRole('dialog', { name: 'Retire this version?', exact: true });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(retire).toBeFocused();
  await request.post('http://127.0.0.1:4010/rest/v1/test/work-plan-permission', {
    data: { allowed: false },
  });
  await retire.click();
  await confirmation.getByRole('button', { name: 'Retire version', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(retire).toBeFocused();
  const retirementError = page.getByRole('region', { name: 'Work Plans', exact: true })
    .getByRole('alert');
  await expect(retirementError).toBeVisible();
  await expect(retirementError).toHaveText('Work Plan management access is required.');
  const released = await request.post('http://127.0.0.1:4010/rest/v1/rpc/list_work_plan_versions', { data: {} });
  expect(workPlanVersionsSchema.parse(await released.json())[0]?.state).toBe('released');
  await request.post('http://127.0.0.1:4010/rest/v1/test/work-plan-permission', {
    data: { allowed: true },
  });
  await retire.click();
  await confirmation.getByRole('button', { name: 'Retire version', exact: true }).click();
  await expect(editor.getByText('retired', { exact: true }).first()).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Release version', exact: true })).toHaveCount(0);
  await expect(editor.getByText('This version is read-only.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open version 1 · Lifecycle workflow', exact: true }).click();
  await expect(editor.getByText('retired', { exact: true }).first()).toBeVisible();
});

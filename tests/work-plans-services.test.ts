import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  createWorkPlan, createWorkPlanDraftVersion, loadWorkPlanWorkspace,
  transitionWorkPlanVersion, saveWorkPlanDraft,
} from '@/services/work-plans';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  permission: vi.fn(),
  list: vi.fn(),
  clone: vi.fn(),
  create: vi.fn(),
  transition: vi.fn(),
  save: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({
  requireAdminShell: mocks.auth,
  requireProfile: mocks.auth,
}));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/data/work-plans', () => ({
  default: vi.fn(),
  createWorkPlanRecord: mocks.create,
  saveWorkPlanDraftRecord: mocks.save,
  transitionWorkPlanVersionRecord: mocks.transition,
  listWorkPlanVersionRecords: mocks.list,
  createWorkPlanDraftVersionRecord: mocks.clone,
}));

const versionId = '10000000-0000-4000-8000-000000000001';
const planId = '10000000-0000-4000-8000-000000000002';
const version = {
  id: versionId,
  work_plan_id: planId,
  code: 'mixing',
  name: 'Mixing',
  version_number: 1,
  state: 'draft',
  revision: 1,
  step_count: 1,
  steps: [{
    key: 'mix',
    title: 'Mix',
    materialization_policy: 'work_order',
    requires_verification: true,
    optional: false,
    instructions: 'Verify the output.',
  }],
  dependencies: [],
};
const db = { authenticated: true };

describe('Work Plan services', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ db, profile: { id: versionId, preferred_locale: 'en' } });
    mocks.permission.mockResolvedValue(true);
    mocks.list.mockResolvedValue({ data: [version], error: null });
    mocks.clone.mockResolvedValue({ data: versionId, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(['settings.manage', 'operations.work_plans.manage'])(
    'denies reads without %s before accessing records',
    async (deniedPermission) => {
      mocks.permission.mockImplementation(
        (_db: unknown, permission: string) => Promise.resolve(permission !== deniedPermission),
      );
      await expect(loadWorkPlanWorkspace()).resolves.toEqual({
        canManage: false, actorId: versionId, locale: 'en', versions: [],
      });
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );

  it('passes the authorized client through and returns validated version summaries', async () => {
    await expect(loadWorkPlanWorkspace()).resolves.toEqual({
      canManage: true, actorId: versionId, locale: 'en', versions: [version],
    });
    expect(mocks.list).toHaveBeenCalledWith(db);
    expect(mocks.permission).toHaveBeenCalledWith(db, 'settings.manage');
    expect(mocks.permission).toHaveBeenCalledWith(db, 'operations.work_plans.manage');
  });

  it('supports an empty workspace', async () => {
    mocks.list.mockResolvedValue({ data: [], error: null });
    await expect(loadWorkPlanWorkspace()).resolves.toEqual({
      canManage: true, actorId: versionId, locale: 'en', versions: [],
    });
  });

  it('rejects malformed nested persisted data with safe error copy', async () => {
    mocks.list.mockResolvedValue({
      data: [{ ...version, steps: [{ ...version.steps[0], requires_verification: 'true' }] }],
      error: null,
    });
    await expect(loadWorkPlanWorkspace()).rejects.toThrow('Unable to load Work Plans.');
    expect(console.error).toHaveBeenCalledWith('work_plan_versions_load', {
      code: 'UNEXPECTED_FAILURE',
    });
  });

  it('logs SDK failures without exposing database messages', async () => {
    const error = { code: '42501', message: 'private query detail' };
    mocks.list.mockResolvedValue({ data: null, error });
    await expect(loadWorkPlanWorkspace()).rejects.toMatchObject({
      message: 'Unable to load Work Plans.', cause: error,
    });
    expect(console.error).toHaveBeenCalledWith('work_plan_versions_load', { code: '42501' });
  });

  it('handles rejected read promises with safe diagnostics', async () => {
    const error = new Error('private connection detail');
    mocks.list.mockRejectedValue(error);
    await expect(loadWorkPlanWorkspace()).rejects.toMatchObject({
      message: 'Unable to load Work Plans.', cause: error,
    });
    expect(console.error).toHaveBeenCalledWith('work_plan_versions_load', {
      code: 'UNEXPECTED_FAILURE',
    });
  });

  it('preserves authentication redirect control flow', async () => {
    const redirect = new Error('NEXT_REDIRECT');
    mocks.auth.mockRejectedValue(redirect);
    await expect(loadWorkPlanWorkspace()).rejects.toBe(redirect);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('rejects an invalid clone request before authentication', async () => {
    await expect(createWorkPlanDraftVersion({ work_plan_id: 'invalid' })).resolves.toEqual({
      ok: false, message: 'Choose a valid Work Plan.',
    });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.clone).not.toHaveBeenCalled();
  });

  it('maps the database unique violation to actionable duplicate-code feedback', async () => {
    mocks.create.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    await expect(createWorkPlan({
      code: 'mixing',
      name: 'Mixing',
      steps: [{
        key: 'mix',
        title: 'Mix',
        materialization_policy: 'work_order',
        task_template: { instructions: '', requires_verification: false },
      }],
      dependencies: [],
    })).resolves.toEqual({ ok: false, message: 'A Work Plan already uses that code.' });
    expect(console.error).toHaveBeenCalledWith('work_plan_create', { code: '23505' });
  });

  it('logs clone SDK failures and returns failure', async () => {
    mocks.clone.mockResolvedValue({ data: null, error: { code: '42501', message: 'private detail' } });
    const result = createWorkPlanDraftVersion({ work_plan_id: planId, request_id: versionId });
    await expect(result).resolves.toEqual({
      ok: false, message: 'Unable to create a new Work Plan version.',
    });
    expect(console.error).toHaveBeenCalledWith('work_plan_draft_version_create', { code: '42501' });
  });

  it('handles a rejected clone promise without reporting success', async () => {
    mocks.clone.mockRejectedValue(new Error('private connection detail'));
    const result = createWorkPlanDraftVersion({ work_plan_id: planId, request_id: versionId });
    await expect(result).resolves.toEqual({
      ok: false, message: 'Connection interrupted. Reload before retrying.',
    });
    expect(console.error).toHaveBeenCalledWith('work_plan_draft_version_create', {
      code: 'UNEXPECTED_FAILURE',
    });
  });

  it('passes the clone operation token through unchanged', async () => {
    const payload = { work_plan_id: planId, request_id: versionId };
    await expect(createWorkPlanDraftVersion(payload)).resolves.toMatchObject({ ok: true });
    expect(mocks.clone).toHaveBeenCalledWith(db, payload);
  });

  it('denies lifecycle writes before persistence and validates target states', async () => {
    await expect(transitionWorkPlanVersion({ version_id: versionId, revision: 1, state: 'released' }))
      .resolves.toMatchObject({ ok: false });
    expect(mocks.auth).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue(false);
    await expect(transitionWorkPlanVersion({ version_id: versionId, revision: 1, state: 'review' }))
      .resolves.toEqual({ ok: false, message: 'Work Plan management access is required.' });
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('returns actionable stale save feedback without reporting success', async () => {
    mocks.save.mockResolvedValue({ data: null, error: { message: 'Work Plan version changed; reload and try again', code: 'P0001' } });
    await expect(saveWorkPlanDraft({
      version_id: versionId,
      revision: 1,
      name: 'Mixing',
      steps: [{
        key: 'mix', title: 'Mix', materialization_policy: 'work_order', task_template: {},
      }],
      dependencies: [],
    }))
      .resolves.toEqual({ ok: false, message: 'Work Plan version changed; reload and try again.' });
  });
});

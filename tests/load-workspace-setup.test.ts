import {
  beforeEach, expect, it, vi,
} from 'vitest';
import loadWorkspaceSetup from '@/services/load-workspace-setup';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), steps: vi.fn(), report: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.auth }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/error-reporting', () => ({ reportApplicationError: mocks.report }));
vi.mock('@/services/workspace-setup', () => ({ default: mocks.steps }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ db: {} });
  mocks.permission.mockResolvedValue(true);
  mocks.steps.mockResolvedValue([]);
  mocks.report.mockResolvedValue(undefined);
});

it('requires the full order workspace before marking the order step accessible', async () => {
  mocks.permission.mockImplementation((_db: unknown, code: string) => Promise.resolve(
    code !== 'inventory.read',
  ));
  await loadWorkspaceSetup();
  expect(mocks.steps).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    orderWorkspace: false, products: true, master: true,
  }));
});

it('presents permission lookup failures as load errors, not denied steps', async () => {
  mocks.permission.mockRejectedValue(new Error('Unavailable'));
  const steps = await loadWorkspaceSetup();
  expect(steps.map((step) => step.state)).toEqual(Array(5).fill('error'));
  expect(mocks.steps).not.toHaveBeenCalled();
});

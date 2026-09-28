import {
  beforeEach, expect, it, vi,
} from 'vitest';
import {
  PlatformAdminAccessError,
  postSignInDestination,
  requirePlatformAdmin,
  setOperationsCopilotPlan,
} from '../src/services/platform-admin';
import type { PlatformAdminRepository } from '../src/data/platform-admin';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isPlatformAdmin: vi.fn(),
  setOperationsCopilotPlan: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase', () => ({
  supabase: () => Promise.resolve({ auth: { getUser: mocks.getUser } }),
}));

const repository: PlatformAdminRepository = {
  isPlatformAdmin: mocks.isPlatformAdmin,
  listOrganizations: () => Promise.resolve([]),
  provisionOrganization: () => Promise.resolve('00000000-0000-4000-8000-000000000002'),
  setOrganizationSuspended: () => Promise.resolve(),
  setOperationsCopilotPlan: mocks.setOperationsCopilotPlan,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
    error: null,
  });
  mocks.isPlatformAdmin.mockResolvedValue(false);
  mocks.setOperationsCopilotPlan.mockResolvedValue(undefined);
});

it('keeps tenant users in the operational workspace', async () => {
  await expect(postSignInDestination(repository)).resolves.toBe('/app');
  await expect(requirePlatformAdmin(repository)).rejects.toBeInstanceOf(PlatformAdminAccessError);
});

it('routes platform operators to the portal and permits platform access', async () => {
  mocks.isPlatformAdmin.mockResolvedValue(true);
  await expect(postSignInDestination(repository)).resolves.toBe('/admin');
  await expect(requirePlatformAdmin(repository)).resolves.toEqual({
    actorUserId: '00000000-0000-4000-8000-000000000001',
  });
});

it('denies access without a verified user before checking membership', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(requirePlatformAdmin(repository)).rejects.toBeInstanceOf(PlatformAdminAccessError);
  expect(mocks.isPlatformAdmin).not.toHaveBeenCalled();
});

it('validates and delegates Operations Copilot plan changes for platform operators', async () => {
  mocks.isPlatformAdmin.mockResolvedValue(true);
  await expect(setOperationsCopilotPlan({
    organizationId: '00000000-0000-4000-8000-000000000010',
    enabled: true,
    reason: 'Premium subscription activated',
  }, repository)).resolves.toBeUndefined();
  expect(mocks.setOperationsCopilotPlan).toHaveBeenCalledWith(
    '00000000-0000-4000-8000-000000000001',
    {
      organizationId: '00000000-0000-4000-8000-000000000010',
      enabled: true,
      reason: 'Premium subscription activated',
    },
  );
});

it('denies tenant administrators and invalid plan changes before persistence', async () => {
  await expect(setOperationsCopilotPlan({
    organizationId: '00000000-0000-4000-8000-000000000010',
    enabled: true,
    reason: 'Premium subscription activated',
  }, repository)).rejects.toBeInstanceOf(PlatformAdminAccessError);
  expect(mocks.setOperationsCopilotPlan).not.toHaveBeenCalled();

  mocks.isPlatformAdmin.mockResolvedValue(true);
  await expect(setOperationsCopilotPlan({
    organizationId: 'not-a-uuid',
    enabled: true,
    reason: 'x',
  }, repository)).rejects.toThrow();
  expect(mocks.setOperationsCopilotPlan).not.toHaveBeenCalled();
});

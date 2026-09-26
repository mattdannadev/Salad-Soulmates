import {
  beforeEach, expect, it, vi,
} from 'vitest';
import {
  PlatformAdminAccessError, postSignInDestination, requirePlatformAdmin,
} from '../src/services/platform-admin';
import type { PlatformAdminRepository } from '../src/data/platform-admin';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isPlatformAdmin: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase', () => ({
  supabase: async () => ({ auth: { getUser: mocks.getUser } }),
}));

const repository = {
  isPlatformAdmin: mocks.isPlatformAdmin,
} as unknown as PlatformAdminRepository;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
    error: null,
  });
  mocks.isPlatformAdmin.mockResolvedValue(false);
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

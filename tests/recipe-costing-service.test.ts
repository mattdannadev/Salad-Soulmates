import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import loadRecipeCostingWorkspace from '@/features/recipe-costing/service';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  permission: vi.fn(),
  load: vi.fn(),
  build: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.auth }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/features/recipe-costing/data', () => ({ default: mocks.load }));
vi.mock('@/features/recipe-costing/domain', () => ({ buildRecipeCostingCatalog: mocks.build }));

describe('recipe costing service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      db: {},
      profile: { preferred_locale: 'en' },
    });
    mocks.permission.mockResolvedValue(true);
    mocks.load.mockResolvedValue({ records: true });
    mocks.build.mockReturnValue([{ id: 'costed-product' }]);
  });

  it('requires both product and supplier master-data read permissions', async () => {
    mocks.permission.mockImplementation(
      (_db: unknown, permission: string) => Promise.resolve(permission !== 'master_data.read'),
    );

    await expect(loadRecipeCostingWorkspace()).resolves.toMatchObject({
      canRead: false,
      products: [],
    });
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('loads and maps the authorized RLS-scoped catalog', async () => {
    await expect(loadRecipeCostingWorkspace()).resolves.toMatchObject({
      canRead: true,
      locale: 'en',
      products: [{ id: 'costed-product' }],
    });
    expect(mocks.load).toHaveBeenCalledWith(expect.anything());
    expect(mocks.build).toHaveBeenCalledWith({ records: true });
  });
});

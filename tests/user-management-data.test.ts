import {
  beforeEach, expect, it, vi,
} from 'vitest';
import {
  filterAndSortUsers,
  loadManagedUser,
  loadUserDirectory,
  userDirectoryQuerySchema,
  type ManagedUser,
} from '@/lib/user-management-data';

const mocks = vi.hoisted(() => ({ context: vi.fn(), permission: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.context }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

const baseUser: ManagedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Morgan',
  lastName: 'Zane',
  displayName: 'Morgan Zane',
  workEmail: 'morgan@example.test',
  facilityName: 'Chicago Kitchen',
  accessProfileName: 'Administrator',
  role: 'admin',
  preferredLocale: 'en',
  active: true,
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    db: { from: vi.fn() },
    profile: { id: baseUser.id },
  });
  mocks.permission.mockResolvedValue(true);
});

it('validates and normalizes URL-backed directory controls', () => {
  expect(userDirectoryQuerySchema.parse({ q: '  kitchen ', sort: 'first_name' }))
    .toEqual({ q: 'kitchen', sort: 'first_name' });
  expect(userDirectoryQuerySchema.parse({})).toEqual({ q: '', sort: 'last_name' });
  expect(userDirectoryQuerySchema.safeParse({ q: 'a'.repeat(121) }).success).toBe(false);
  expect(userDirectoryQuerySchema.safeParse({ sort: 'email' }).success).toBe(false);
  expect(userDirectoryQuerySchema.safeParse({ q: ['one', 'two'] }).success).toBe(false);
});

it('searches trusted directory fields and supports first-name or last-name sorting', () => {
  const users: ManagedUser[] = [
    baseUser,
    {
      ...baseUser,
      id: '00000000-0000-4000-8000-000000000002',
      firstName: 'Alex',
      lastName: 'Young',
      displayName: 'Alex Young',
      workEmail: 'alex@example.test',
      facilityName: 'Milwaukee Kitchen',
      accessProfileName: 'Receiver',
    },
    {
      ...baseUser,
      id: '00000000-0000-4000-8000-000000000003',
      firstName: 'Zoe',
      lastName: 'Adams',
      displayName: 'Zoe Adams',
      workEmail: null,
      facilityName: 'Chicago Kitchen',
      accessProfileName: 'Worker',
    },
  ];
  expect(filterAndSortUsers(users, { q: '', sort: 'last_name' }).map((user) => user.lastName))
    .toEqual(['Adams', 'Young', 'Zane']);
  expect(filterAndSortUsers(users, { q: '', sort: 'first_name' }).map((user) => user.firstName))
    .toEqual(['Alex', 'Morgan', 'Zoe']);
  expect(filterAndSortUsers(users, { q: 'milwaukee', sort: 'last_name' }))
    .toHaveLength(1);
  expect(filterAndSortUsers(users, { q: 'receiver', sort: 'last_name' })[0]?.firstName)
    .toBe('Alex');
  expect(filterAndSortUsers(users, { q: 'EXAMPLE.TEST', sort: 'last_name' }))
    .toHaveLength(2);
});

it('enforces access.manage before loading directory records', async () => {
  mocks.permission.mockResolvedValue(false);
  await expect(loadUserDirectory({ q: '', sort: 'last_name' }))
    .rejects.toThrow('REDIRECT:/app');
  expect(mocks.context).toHaveBeenCalled();
  expect(mocks.context.mock.results[0]?.value).toBeDefined();
});

it('rejects malformed detail ids before authentication', async () => {
  await expect(loadManagedUser('not-a-user-id')).rejects.toThrow('NOT_FOUND');
  expect(mocks.context).not.toHaveBeenCalled();
});

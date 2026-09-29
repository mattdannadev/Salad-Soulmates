import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import Users from '@/app/app/user-management/users/page';
import UserDetail from '@/app/app/user-management/users/[id]/page';
import type { ManagedUserDetail } from '@/lib/user-management-data';

const mocks = vi.hoisted(() => ({
  directory: vi.fn(),
  detail: vi.fn(),
  auth: vi.fn(),
  toolbar: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.auth }));
vi.mock('@/components/directory-toolbar', () => ({
  default: (props: unknown) => {
    mocks.toolbar(props);
    return createElement('section', { 'aria-label': 'Directory toolbar' });
  },
}));
vi.mock('@/lib/user-management-data', async (original) => ({
  ...await original<typeof import('@/lib/user-management-data')>(),
  loadUserDirectory: mocks.directory,
  loadManagedUser: mocks.detail,
}));
vi.mock('@/components/user-invitation-panel', () => ({
  default: () => createElement(
    'section',
    { 'aria-label': 'Invitation panel' },
    'Invitation form',
  ),
}));

interface AccountActionProps {
  active: boolean;
  isCurrentUser: boolean;
}

vi.mock('@/components/user-account-actions', () => ({
  default: ({ active, isCurrentUser }: AccountActionProps) => createElement(
    'section',
    { 'aria-label': 'Account actions' },
    `${active ? 'Security actions available' : 'Security actions unavailable'}${isCurrentUser ? ' Current user' : ''}`,
  ),
}));

const userId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000001';
const user: ManagedUserDetail = {
  id: userId,
  accessProfileId: '00000000-0000-4000-8000-000000000003',
  firstName: 'Ana',
  lastName: 'Rivera',
  displayName: 'Ana Rivera',
  workEmail: 'ana@example.test',
  facilityName: 'Chicago Kitchen',
  accessProfileName: 'Receiver',
  role: 'receiver',
  preferredLocale: 'es',
  active: true,
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  loginHistory: [{
    id: '00000000-0000-4000-8000-000000000050',
    event_type: 'signed_in',
    occurred_at: '2026-09-21T14:30:00.000Z',
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.directory.mockResolvedValue({ users: [user], totalUsers: 1, actorUserId: actorId });
  mocks.detail.mockResolvedValue({ user, actorUserId: actorId, accessProfiles: [] });
  mocks.auth.mockResolvedValue({ profile: { preferred_locale: 'en' } });
});

it('renders a responsive directory with validated URL search, sorting, and invitations', async () => {
  const html = renderToStaticMarkup(await Users({
    searchParams: Promise.resolve({ q: '  ana ', sort: 'first_name' }),
  }));
  expect(mocks.directory).toHaveBeenCalledWith({ q: 'ana', sort: 'first_name' });
  expect(html).toContain('aria-label="User directory"');
  expect(html).toContain('<table');
  expect(html).toContain('<th scope="col">Email</th>');
  expect(html).toContain('Ana Rivera');
  expect(html).toContain('ana@example.test');
  expect(html).not.toContain('Email not recorded');
  expect(html).toContain(`href="/app/user-management/users/${userId}?returnTo=%2Fapp%2Fuser-management%2Fusers%3Fq%3Dana%26sort%3Dfirst_name&amp;focusRow=${userId}"`);
  expect(html).not.toContain('View profile →');
  expect(html).toContain('aria-label="Directory toolbar"');
  expect(mocks.toolbar).toHaveBeenCalledWith(expect.objectContaining({
    label: 'Search users',
    resultCount: 1,
    locale: 'en',
    mobileFilters: true,
    sortOptions: [
      { value: 'last_name', label: 'Last name' },
      { value: 'first_name', label: 'First name' },
    ],
  }));
  expect(html).toContain('aria-label="Invitation panel"');
});

it('distinguishes an empty directory from a search with no matches', async () => {
  mocks.directory.mockResolvedValue({ users: [], totalUsers: 0, actorUserId: actorId });
  const empty = renderToStaticMarkup(await Users({ searchParams: Promise.resolve({}) }));
  expect(empty).toContain('No users yet');
  expect(empty).toContain('Invite a user with the form below.');
  expect(empty).not.toContain('Clear all filters');

  mocks.directory.mockResolvedValue({ users: [], totalUsers: 3, actorUserId: actorId });
  const unmatched = renderToStaticMarkup(await Users({
    searchParams: Promise.resolve({ q: 'missing' }),
  }));
  expect(unmatched).toContain('No matching users');
  expect(unmatched).toContain('href="/app/user-management/users"');
  expect(unmatched).toContain('Clear all filters');
});

it('localizes the directory controls, columns, status and recovery copy', async () => {
  mocks.auth.mockResolvedValue({ profile: { preferred_locale: 'es' } });
  const populated = renderToStaticMarkup(await Users({ searchParams: Promise.resolve({}) }));
  expect(populated).toContain('Usuarios');
  expect(populated).toContain('Directorio de usuarios');
  expect(populated).toContain('Correo electrónico');
  expect(populated).toContain('Activo');
  expect(mocks.toolbar).toHaveBeenCalledWith(expect.objectContaining({
    label: 'Buscar usuarios',
    locale: 'es',
  }));

  mocks.directory.mockResolvedValue({ users: [], totalUsers: 3, actorUserId: actorId });
  const unmatched = renderToStaticMarkup(await Users({
    searchParams: Promise.resolve({ q: 'nadie' }),
  }));
  expect(unmatched).toContain('No hay usuarios que coincidan');
  expect(unmatched).toContain('Borrar todos los filtros');
});

it('rejects repeated and unsupported directory query values', async () => {
  await expect(Users({
    searchParams: Promise.resolve({ q: ['ana', 'rivera'], sort: 'last_name' }),
  })).rejects.toThrow('NOT_FOUND');
  await expect(Users({
    searchParams: Promise.resolve({ sort: 'email' }),
  })).rejects.toThrow('NOT_FOUND');
  expect(mocks.directory).not.toHaveBeenCalled();
});

it('shows profile, access, recent activity, and security controls on user detail', async () => {
  const html = renderToStaticMarkup(await UserDetail({
    params: Promise.resolve({ id: userId }),
    searchParams: Promise.resolve({
      returnTo: '/app/user-management/users?q=ana&sort=first_name',
      focusRow: userId,
    }),
  }));
  expect(mocks.detail).toHaveBeenCalledWith(userId);
  expect(html).toContain('Ana Rivera');
  expect(html).toContain('Chicago Kitchen');
  expect(html).toContain('Receiver');
  expect(html).toContain('Español');
  expect(html).toContain('Signed in');
  expect(html).toContain('Security actions available');
  expect(html).not.toContain('Current user');
  expect(html).toContain(`href="/app/user-management/users?q=ana&amp;sort=first_name&amp;focusRow=${userId}"`);
});

it('explains unavailable audit history and retained deactivation details', async () => {
  mocks.detail.mockResolvedValue({
    actorUserId: actorId,
    user: {
      ...user,
      active: false,
      deactivatedAt: '2026-09-21T15:00:00.000Z',
      deactivationReason: 'Employment ended',
      loginHistory: null,
    },
  });
  const html = renderToStaticMarkup(await UserDetail({
    params: Promise.resolve({ id: userId }),
    searchParams: Promise.resolve({}),
  }));
  expect(html).toContain('Inactive');
  expect(html).toContain('Employment ended');
  expect(html).toContain('Login history requires audit access.');
  expect(html).toContain('Security actions unavailable');
});

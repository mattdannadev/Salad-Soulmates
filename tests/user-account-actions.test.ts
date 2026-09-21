import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import UserAccountActions from '@/components/user-account-actions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/app/user-management-actions', () => ({
  changeManagedUserAccessProfile: vi.fn(),
  generateUserPasswordResetLink: vi.fn(),
  deactivateManagedUser: vi.fn(),
}));

const userId = '00000000-0000-4000-8000-000000000002';
const accessProfileProps = {
  currentAccessProfileId: '00000000-0000-4000-8000-000000000003',
  accessProfiles: [{ id: '00000000-0000-4000-8000-000000000003', name: 'Receiver' }],
};

it('requires explicit confirmation and explains that delete preserves history', () => {
  const html = renderToStaticMarkup(createElement(UserAccountActions, {
    userId,
    userName: 'Ana Rivera',
    active: true,
    isCurrentUser: false,
    ...accessProfileProps,
  }));
  expect(html).toContain('Create password-reset link');
  expect(html).toContain('Save access profile');
  expect(html).toContain('Delete user');
  expect(html).toContain('<dialog');
  expect(html).toContain('Delete Ana Rivera?');
  expect(html).toContain('does not hard-delete the authentication account or historical work');
  expect(html).toContain('Reason for deactivation');
  expect(html).toContain('Confirm delete');
  expect(html).toContain(`name="user_id" value="${userId}"`);
  expect(html).not.toContain('name="email"');
});

it('disables self-deactivation and all inactive-account security actions', () => {
  const own = renderToStaticMarkup(createElement(UserAccountActions, {
    userId,
    userName: 'Current Administrator',
    active: true,
    isCurrentUser: true,
    ...accessProfileProps,
  }));
  expect(own).toContain('You cannot deactivate your own access.');
  expect(own).toMatch(/disabled=""[^>]*>Delete user/);

  const inactive = renderToStaticMarkup(createElement(UserAccountActions, {
    userId,
    userName: 'Inactive User',
    active: false,
    isCurrentUser: false,
    ...accessProfileProps,
  }));
  expect(inactive).toContain('This user is inactive.');
  expect(inactive).not.toContain('Create password-reset link');
  expect(inactive).not.toContain('Delete user');
});

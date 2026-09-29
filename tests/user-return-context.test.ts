import { describe, expect, it, vi } from 'vitest';
import {
  userDetailHref,
  userDirectoryHref,
  userReturnContext,
  userReturnHref,
} from '../src/app/app/user-management/users/return-context';

const userId = '00000000-0000-4000-8000-000000000002';

vi.mock('server-only', () => ({}));

describe('user-management return context', () => {
  it('retains filtered and sorted directory state through the detail link', () => {
    const directory = userDirectoryHref({ q: 'ana', sort: 'first_name' });
    const detail = new URL(userDetailHref(userId, directory), 'https://user-return.invalid');
    const context = userReturnContext(
      detail.searchParams.get('returnTo'),
      detail.searchParams.get('focusRow'),
    );
    expect(context).toEqual({ href: directory, focusRow: userId });
    expect(userReturnHref(context, userId)).toBe(
      `/app/user-management/users?q=ana&sort=first_name&focusRow=${userId}`,
    );
  });

  it('keeps a fragment and deterministic fallback', () => {
    const context = userReturnContext('/app/user-management/users?q=ana#results', userId);
    expect(userReturnHref(context)).toBe(
      `/app/user-management/users?q=ana&focusRow=${userId}#results`,
    );
    expect(userReturnContext(undefined, undefined)).toEqual({ href: '/app/user-management/users' });
  });

  it('rejects external, malformed, unrelated, and invalid focus destinations', () => {
    [
      '//evil.example',
      '/app/orders',
      '/app/user-management/profiles',
      '/app/user-management/users/%2e%2e/orders',
    ].forEach((destination) => {
      expect(userReturnContext(destination, userId)).toEqual({
        href: '/app/user-management/users',
        focusRow: userId,
      });
    });
    expect(userReturnContext('/app/user-management/users', 'bad row')).toEqual({
      href: '/app/user-management/users',
    });
  });

  it('falls back from malformed directory searches that would otherwise 404', () => {
    expect(userReturnContext(`/app/user-management/users?q=${'x'.repeat(200)}`, userId)).toEqual({
      href: `/app/user-management/users?q=${'x'.repeat(200)}`,
      focusRow: userId,
    });
    [
      '/app/user-management/users?sort=email',
      '/app/user-management/users?q=one&q=two',
      `/app/user-management/users?q=${'x'.repeat(201)}`,
      '/app/user-management/users?sort=first_name&sort=last_name',
      '/app/user-management/users?unexpected=true',
    ].forEach((destination) => {
      expect(userReturnContext(destination, userId)).toEqual({
        href: '/app/user-management/users',
        focusRow: userId,
      });
    });
  });
});

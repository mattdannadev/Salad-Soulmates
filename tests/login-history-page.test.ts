import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import LoginHistoryPage from '@/app/app/user-management/login-history/page';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const eventQuery = {
    select: vi.fn(),
    order: vi.fn(),
    limit,
  };
  const db = {
    from: vi.fn(() => eventQuery),
    rpc: vi.fn(),
  };
  return {
    db,
    eventQuery,
    limit,
    permission: vi.fn(),
    auth: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    logFailure: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.auth }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', async (original) => ({
  ...await original<typeof import('@/lib/operation-error')>(),
  logFailure: mocks.logFailure,
}));

const userId = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventQuery.select.mockReturnValue(mocks.eventQuery);
  mocks.eventQuery.order.mockReturnValue(mocks.eventQuery);
  mocks.permission.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({
    db: mocks.db,
    profile: { preferred_locale: 'en' },
  });
  mocks.db.rpc.mockResolvedValue({
    data: [{ user_id: userId, display_name: 'Avery Green' }],
    error: null,
  });
});

describe('Login History page', () => {
  it('shows newest activity first with user, outcome and source', async () => {
    mocks.limit.mockResolvedValue({
      data: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          user_id: userId,
          event_type: 'signed_out',
          ip_address: null,
          user_agent: null,
          occurred_at: '2026-09-21T12:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000011',
          user_id: userId,
          event_type: 'signed_in',
          ip_address: '192.0.2.1',
          user_agent: 'Test browser',
          occurred_at: '2026-09-21T13:00:00.000Z',
        },
      ],
      error: null,
    });
    const html = renderToStaticMarkup(await LoginHistoryPage());
    expect(html.indexOf('Signed in')).toBeLessThan(html.indexOf('Signed out'));
    expect(html).toContain('Avery Green');
    expect(html).toContain('Test browser · 192.0.2.1');
    expect(mocks.db.rpc).toHaveBeenCalledWith('login_event_user_names');
    expect(mocks.eventQuery.order).toHaveBeenCalledWith(
      'occurred_at',
      { ascending: false },
    );
  });

  it('renders a safe error state without partial results', async () => {
    mocks.limit.mockResolvedValue({
      data: null,
      error: { code: 'HISTORY_FAILED', message: 'private detail' },
    });
    const html = renderToStaticMarkup(await LoginHistoryPage());
    expect(html).toContain('Login history is unavailable');
    expect(html).not.toContain('private detail');
    expect(mocks.logFailure).toHaveBeenCalledWith('login_history_page', expect.any(Error));
  });

  it('redirects users without audit access before reading events', async () => {
    mocks.permission.mockResolvedValue(false);
    await expect(LoginHistoryPage()).rejects.toThrow('REDIRECT:/app');
    expect(mocks.db.from).not.toHaveBeenCalled();
    expect(mocks.db.rpc).not.toHaveBeenCalled();
  });
});

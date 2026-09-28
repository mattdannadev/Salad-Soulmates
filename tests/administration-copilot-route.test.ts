import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import AdministrationCopilotPage from '@/app/app/administration-copilot/page';
import { POST } from '@/app/api/administration-diagnostics/route';

const mocks = vi.hoisted(() => ({
  diagnostic: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/services/administration-diagnostics', () => ({
  runAdministrationDiagnosticForApi: mocks.diagnostic,
}));

const request = (body: unknown) => new Request('http://localhost/api/administration-diagnostics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Administration Copilot route', () => {
  it('returns a successful result without permitting storage', async () => {
    mocks.diagnostic.mockResolvedValueOnce({
      ok: true,
      toolId: 'tenant_setup_status',
      classification: 'read',
      source: '/app/user-management/users',
      scope: 'organization_and_active_facility',
      count: 0,
      records: [],
    });
    const response = await POST(request({ intent: 'tenant_setup_status' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      classification: 'read',
    });
  });

  it('maps validation and authorization denials to customer-safe statuses', async () => {
    mocks.diagnostic
      .mockResolvedValueOnce({ ok: false, code: 'invalid', error: 'Choose a valid diagnostic.' })
      .mockResolvedValueOnce({ ok: false, code: 'denied', error: 'You do not have access.' });
    const invalid = await POST(request({ intent: 'sql' }));
    const denied = await POST(request({ intent: 'login_events' }));
    expect(invalid.status).toBe(400);
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({
      ok: false,
      code: 'denied',
      error: 'You do not have access.',
    });
  });

  it('returns explicit JSON authentication outcomes', async () => {
    mocks.diagnostic
      .mockResolvedValueOnce({
        ok: false,
        code: 'unauthenticated',
        error: 'Sign in to use administration diagnostics.',
      })
      .mockResolvedValueOnce({
        ok: false,
        code: 'denied',
        error: 'An active administrative access profile is required.',
      });
    const unauthenticated = await POST(request({ intent: 'login_events' }));
    const roleDenied = await POST(request({ intent: 'login_events' }));
    expect(unauthenticated.status).toBe(401);
    expect(roleDenied.status).toBe(403);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      ok: false,
      code: 'unauthenticated',
    });
  });

  it('returns a safe unavailable response for unexpected service failures', async () => {
    mocks.diagnostic.mockRejectedValueOnce(new Error('private database detail'));
    const response = await POST(request({ intent: 'recent_errors' }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database detail');
  });
});

describe('Administration Copilot page', () => {
  it('offers fixed read-only diagnostics and visible configuration links', () => {
    const html = renderToStaticMarkup(AdministrationCopilotPage());
    expect(html).toContain('Administration Copilot');
    expect(html).toContain('Check tenant setup');
    expect(html).toContain('Review recent errors');
    expect(html).toContain('Review login activity');
    expect(html).toContain('Settings and picklists');
    expect(html).toContain('href="/app/user-management/login-history"');
    expect(html).not.toContain('<textarea');
  });
});

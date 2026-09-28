import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import OperationsCopilotPage from '@/app/app/operations-copilot/page';
import { POST } from '@/app/api/operations-copilot/route';

const mocks = vi.hoisted(() => ({ query: vi.fn(), requireAdminShell: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/services/operations-copilot', () => ({ default: mocks.query }));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.requireAdminShell }));

const request = () => new Request('http://localhost/api/operations-copilot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind: 'recipes', limit: 12 }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminShell.mockResolvedValue({ profile: { role: 'admin' } });
});

describe('Operations Copilot route', () => {
  it.each([
    ['unauthenticated', 401],
    ['denied', 403],
    ['invalid', 400],
    ['unavailable', 503],
    ['rate_limited', 429],
  ] as const)('maps %s results to status %i', async (code, status) => {
    mocks.query.mockResolvedValueOnce({ ok: false, code, error: 'Safe error.' });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns successful read-only results without caching', async () => {
    mocks.query.mockResolvedValueOnce({
      ok: true,
      kind: 'recipes',
      records: [],
      source: '/app/recipes',
      count: 0,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('rejects an oversized request before invoking the service', async () => {
    const response = await POST(new Request('http://localhost/api/operations-copilot', {
      method: 'POST',
      body: JSON.stringify({ kind: 'recipes', search: 'x'.repeat(3_000) }),
    }));
    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('passes malformed JSON as invalid input to the service', async () => {
    mocks.query.mockResolvedValueOnce({ ok: false, code: 'invalid', error: 'Safe error.' });
    const response = await POST(new Request('http://localhost/api/operations-copilot', {
      method: 'POST',
      body: '{',
    }));
    expect(response.status).toBe(400);
    expect(mocks.query).toHaveBeenCalledWith(null, expect.any(AbortSignal));
  });

  it('returns 503 promptly when a pending operation is cancelled', async () => {
    mocks.query.mockReturnValueOnce(new Promise<never>(() => {
      // Model a service that ignores cancellation.
    }));
    const controller = new AbortController();
    const pending = POST(new Request('http://localhost/api/operations-copilot', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({ kind: 'recipes' }),
    }));
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledOnce());
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('Operations Copilot page', () => {
  it('redirects a reviewer away from the administrator workspace', async () => {
    mocks.requireAdminShell.mockResolvedValueOnce({ profile: { role: 'reviewer' } });
    await expect(OperationsCopilotPage()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('presents typed read-only checks and no free-form prompt', async () => {
    const html = renderToStaticMarkup(await OperationsCopilotPage());
    expect(html).toContain('Operations Copilot');
    expect(html).toContain('READ ONLY');
    expect(html).toContain('Find recipes');
    expect(html).not.toContain('<textarea');
  });
});

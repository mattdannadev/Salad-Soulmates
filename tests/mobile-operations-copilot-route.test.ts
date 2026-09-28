import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { GET } from '@/app/api/mobile-operations-copilot/route';
import WorkerCopilotPage from '@/app/worker/copilot/page';
import ReceivingCopilotPage from '@/app/receiving/copilot/page';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/services/mobile-operations-copilot', () => ({ default: mocks.query }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MOBILE_OPERATIONS_COPILOT_ENABLED', 'true');
});

afterEach(() => vi.unstubAllEnvs());

describe('Mobile Operations Copilot API', () => {
  it('denies the API and both pages when the future mobile feature is disabled', async () => {
    vi.stubEnv('MOBILE_OPERATIONS_COPILOT_ENABLED', '');
    const response = await GET(new Request(
      'http://localhost/api/mobile-operations-copilot?kind=preparations',
    ));
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.query).not.toHaveBeenCalled();
    await expect(WorkerCopilotPage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    await expect(ReceivingCopilotPage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
  it.each([
    ['unauthenticated', 401],
    ['denied', 403],
    ['invalid', 400],
    ['unavailable', 503],
  ] as const)('maps %s outcomes to status %i', async (code, status) => {
    mocks.query.mockResolvedValueOnce({ ok: false, code, error: 'Safe error.' });
    const response = await GET(new Request(
      'http://localhost/api/mobile-operations-copilot?kind=preparations&limit=10',
    ));
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('parses only the fixed kind and bounded limit parameters', async () => {
    mocks.query.mockResolvedValueOnce({
      ok: true, kind: 'deliveries', records: [], count: 0,
    });
    const response = await GET(new Request(
      'http://localhost/api/mobile-operations-copilot?kind=deliveries&limit=6&table=profiles',
    ));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith({ kind: 'deliveries', limit: 6 });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('converts unexpected failures into a safe unavailable response', async () => {
    mocks.query.mockRejectedValueOnce(new Error('database internals'));
    const response = await GET(new Request(
      'http://localhost/api/mobile-operations-copilot?kind=preparations',
    ));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'unavailable',
      error: 'Mobile Copilot is temporarily unavailable.',
    });
  });
});

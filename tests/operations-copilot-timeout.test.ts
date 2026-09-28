import {
  describe, expect, it, vi,
} from 'vitest';
import { POST } from '@/app/api/operations-copilot/route';

const mocks = vi.hoisted(() => ({
  authStarted: vi.fn(), authAborted: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({
  resolveApiAdminShell: (signal: AbortSignal) => new Promise((_resolve, reject) => {
    mocks.authStarted();
    signal.addEventListener('abort', () => {
      mocks.authAborted();
      reject(new DOMException('Timed out', 'TimeoutError'));
    }, { once: true });
  }),
}));

describe('Operations Copilot whole-request timeout', () => {
  it('returns 503 and aborts a slow authentication lookup at the route deadline', async () => {
    const startedAt = performance.now();
    const response = await POST(new Request('http://localhost/api/operations-copilot', {
      method: 'POST',
      body: JSON.stringify({ kind: 'recipes' }),
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.authStarted).toHaveBeenCalledOnce();
    expect(mocks.authAborted).toHaveBeenCalledOnce();
    expect(performance.now() - startedAt).toBeLessThan(6_500);
  }, 8_000);
});

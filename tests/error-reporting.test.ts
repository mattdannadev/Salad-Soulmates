import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { reportApplicationError } from '../src/lib/error-reporting';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  supabase: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000123',
}));
vi.mock('../src/lib/supabase', () => ({ supabase: mocks.supabase }));

describe('application error reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.supabase.mockResolvedValue({ from: mocks.from });
  });

  it('logs and persists only safe structured diagnostics', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = Object.assign(new Error('password=do-not-log'), { code: '42P01' });

    const reference = await reportApplicationError({
      cause,
      message: 'Settings data could not be loaded.',
      operation: 'settings.load',
      requestId: 'request-123',
      route: '/app/settings',
    });

    expect(reference).toEqual({
      code: '42P01',
      errorId: '00000000-0000-4000-8000-000000000123',
    });
    expect(mocks.from).toHaveBeenCalledWith('application_error_logs');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      error_code: '42P01',
      error_name: 'Error',
      operation: 'settings.load',
      route: '/app/settings',
      safe_message: 'Settings data could not be loaded.',
    }));
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain('do-not-log');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('do-not-log');
  });

  it('returns a trace reference when persistence fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.insert.mockResolvedValue({ error: { code: '42501' } });

    await expect(reportApplicationError({
      message: 'The request could not be completed.',
      operation: 'orders.save',
    })).resolves.toEqual({
      code: 'UNEXPECTED_FAILURE',
      errorId: '00000000-0000-4000-8000-000000000123',
    });
    expect(console.error).toHaveBeenLastCalledWith('application_error_persistence_failed', {
      errorId: '00000000-0000-4000-8000-000000000123',
      persistenceCode: '42501',
    });
  });

  it('does not throw when the authenticated client cannot be created', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.supabase.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'NETWORK' }));

    await expect(reportApplicationError({
      message: 'The request could not be completed.',
      operation: 'dashboard.load',
    })).resolves.toMatchObject({ code: 'UNEXPECTED_FAILURE' });
    expect(console.error).toHaveBeenLastCalledWith('application_error_persistence_failed', {
      errorId: '00000000-0000-4000-8000-000000000123',
      persistenceCode: 'NETWORK',
    });
  });
});

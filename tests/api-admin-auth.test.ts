import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { resolveApiAdminShell } from '@/lib/auth';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  const db = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  };
  return {
    configured: vi.fn(),
    supabase: vi.fn(),
    db,
    profileQuery,
    maybeSingle,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({
  isConfigured: mocks.configured,
  supabase: mocks.supabase,
}));

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002';
const FACILITY_ID = '00000000-0000-4000-8000-000000000003';
const ACCESS_PROFILE_ID = '00000000-0000-4000-8000-000000000004';
const profile = {
  id: USER_ID,
  organization_id: ORGANIZATION_ID,
  facility_id: FACILITY_ID,
  display_name: 'Admin User',
  role: 'admin' as const,
  preferred_locale: 'en' as const,
  active: true,
  access_profile_id: ACCESS_PROFILE_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.supabase.mockResolvedValue(mocks.db);
  mocks.db.from.mockReturnValue(mocks.profileQuery);
  mocks.profileQuery.select.mockReturnValue(mocks.profileQuery);
  mocks.profileQuery.eq.mockReturnValue(mocks.profileQuery);
  mocks.db.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
});

describe('API administration authentication', () => {
  it('returns 401 when there is no signed-in user', async () => {
    mocks.db.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(resolveApiAdminShell()).resolves.toMatchObject({ ok: false, status: 401 });
    expect(mocks.db.from).not.toHaveBeenCalled();
  });

  it('returns 403 for missing, inactive, worker, and receiver profiles', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ...profile, active: false }, error: null })
      .mockResolvedValueOnce({ data: { ...profile, role: 'worker' }, error: null })
      .mockResolvedValueOnce({ data: { ...profile, role: 'receiver' }, error: null });
    await expect(resolveApiAdminShell()).resolves.toMatchObject({ status: 403 });
    await expect(resolveApiAdminShell()).resolves.toMatchObject({ status: 403 });
    await expect(resolveApiAdminShell()).resolves.toMatchObject({ status: 403 });
    await expect(resolveApiAdminShell()).resolves.toMatchObject({ status: 403 });
  });

  it('returns the tenant-scoped profile for an active administrator', async () => {
    await expect(resolveApiAdminShell()).resolves.toMatchObject({
      ok: true,
      profile: {
        organization_id: ORGANIZATION_ID,
        facility_id: FACILITY_ID,
      },
    });
    expect(mocks.supabase).toHaveBeenCalledWith({ readOnly: true });
  });

  it('returns 503 when server configuration is unavailable', async () => {
    mocks.configured.mockReturnValueOnce(false);
    await expect(resolveApiAdminShell()).resolves.toMatchObject({ ok: false, status: 503 });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it('bounds a stalled session lookup and passes cancellation to the client', async () => {
    mocks.db.auth.getUser.mockReturnValueOnce(new Promise<never>(() => {
      // Model an authentication provider that never answers.
    }));
    const signal = AbortSignal.timeout(20);
    await expect(resolveApiAdminShell(signal)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(mocks.supabase).toHaveBeenCalledWith({ readOnly: true, signal });
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
});

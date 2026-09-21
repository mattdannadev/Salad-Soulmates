import {
  beforeEach, expect, it, vi,
} from 'vitest';
import {
  deactivateManagedUser,
  generateUserPasswordResetLink,
} from '@/app/user-management-actions';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  permission: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  generateLink: vi.fn(),
  auditInsert: vi.fn(),
  admin: vi.fn(),
  revalidate: vi.fn(),
  log: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: mocks.admin,
  SupabaseConfigurationError: class SupabaseConfigurationError extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const organizationId = '00000000-0000-4000-8000-000000000010';
const initial = { ok: false, message: '' };

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: mocks.maybeSingle,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const db = { from: vi.fn(() => query), rpc: mocks.rpc };
  mocks.profile.mockResolvedValue({
    db,
    profile: { id: actorId, organization_id: organizationId },
  });
  mocks.permission.mockResolvedValue(true);
  mocks.maybeSingle.mockResolvedValue({ data: { id: targetId, active: true }, error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: targetId, email: 'trusted@example.test' } },
    error: null,
  });
  mocks.generateLink.mockResolvedValue({
    data: {
      user: { id: targetId },
      properties: { action_link: 'https://example.test/auth/reset?token=one-time' },
    },
    error: null,
  });
  mocks.auditInsert.mockResolvedValue({ data: null, error: null });
  mocks.admin.mockReturnValue({
    auth: { admin: { getUserById: mocks.getUser, generateLink: mocks.generateLink } },
    from: vi.fn(() => ({ insert: mocks.auditInsert })),
  });
});

it('rejects malformed action input before authentication', async () => {
  expect(await generateUserPasswordResetLink(initial, form({ user_id: 'invalid' })))
    .toMatchObject({ ok: false });
  expect(await deactivateManagedUser(initial, form({ user_id: targetId, reason: 'x' })))
    .toMatchObject({ ok: false });
  expect(mocks.profile).not.toHaveBeenCalled();
});

it('requires access.manage before loading or mutating the target', async () => {
  mocks.permission.mockResolvedValue(false);
  expect(await generateUserPasswordResetLink(initial, form({ user_id: targetId })))
    .toEqual({ ok: false, message: 'Access management permission required.' });
  expect(mocks.maybeSingle).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});

it('resolves the trusted Auth email by user id and audits a generated recovery link', async () => {
  const result = await generateUserPasswordResetLink(
    initial,
    form({ user_id: targetId, email: 'browser-supplied@example.test' }),
  );
  expect(result).toMatchObject({
    ok: true,
    resetLink: 'https://example.test/auth/reset?token=one-time',
  });
  expect(mocks.getUser).toHaveBeenCalledWith(targetId);
  expect(mocks.generateLink).toHaveBeenCalledWith(expect.objectContaining({
    type: 'recovery',
    email: 'trusted@example.test',
  }));
  expect(mocks.generateLink).not.toHaveBeenCalledWith(expect.objectContaining({
    email: 'browser-supplied@example.test',
  }));
  expect(mocks.auditInsert).toHaveBeenCalledWith(expect.objectContaining({
    actor_user_id: actorId,
    entity_id: targetId,
    event_type: 'USER_PASSWORD_RESET_LINK_GENERATED',
  }));
});

it('reports a safe partial failure and withholds an unaudited reset link', async () => {
  mocks.auditInsert.mockResolvedValue({ data: null, error: { code: '503', message: 'private' } });
  const result = await generateUserPasswordResetLink(initial, form({ user_id: targetId }));
  expect(result.ok).toBe(false);
  expect(result.message).toContain('audit record');
  expect(result.resetLink).toBeUndefined();
  expect(result.message).not.toContain('private');
});

it('turns rejected Auth, audit, and database promises into safe retry results', async () => {
  mocks.generateLink.mockRejectedValueOnce(new Error('network secret'));
  const authFailure = await generateUserPasswordResetLink(initial, form({ user_id: targetId }));
  expect(authFailure.ok).toBe(false);
  expect(authFailure.message).not.toContain('secret');

  mocks.auditInsert.mockRejectedValueOnce(new Error('audit secret'));
  const auditFailure = await generateUserPasswordResetLink(initial, form({ user_id: targetId }));
  expect(auditFailure.ok).toBe(false);
  expect(auditFailure.message).toContain('audit record');
  expect(auditFailure.resetLink).toBeUndefined();

  mocks.rpc.mockRejectedValueOnce(new Error('database secret'));
  const databaseFailure = await deactivateManagedUser(
    initial,
    form({ user_id: targetId, reason: 'Employment ended' }),
  );
  expect(databaseFailure.ok).toBe(false);
  expect(databaseFailure.message).not.toContain('secret');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('deactivates through the audited RPC and revalidates directory and detail', async () => {
  const result = await deactivateManagedUser(
    initial,
    form({ user_id: targetId, reason: 'Employment ended' }),
  );
  expect(result.ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith('deactivate_user_access', {
    target_user_id: targetId,
    reason: 'Employment ended',
  });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/user-management/users');
  expect(mocks.revalidate).toHaveBeenCalledWith(`/app/user-management/users/${targetId}`);
  expect(mocks.admin).not.toHaveBeenCalled();
});

it('blocks self-deactivation and hides unexpected database details', async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: { id: actorId, active: true }, error: null });
  expect(await deactivateManagedUser(
    initial,
    form({ user_id: actorId, reason: 'No longer needed' }),
  )).toEqual({ ok: false, message: 'You cannot deactivate your own access.' });
  expect(mocks.rpc).not.toHaveBeenCalled();

  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
  const failed = await deactivateManagedUser(
    initial,
    form({ user_id: targetId, reason: 'No longer needed' }),
  );
  expect(failed.ok).toBe(false);
  expect(failed.message).not.toContain('private');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
  saveRecord, signIn, signOut, updatePassword, requestPasswordReset, approveAccessRequest,
  inviteUserFromSettings, setPreferredLocale,
} from '../src/app/actions';

const mocks = vi.hoisted(() => {
  interface Result {
    data: unknown;
    error: { code: string; message: string } | null;
  }
  const execute = vi.fn<() => Promise<Result>>();
  const query = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    single: execute,
    maybeSingle: execute,
    then: (
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown,
    ) => execute().then(resolve, reject),
  };
  const rpc = vi.fn();
  const auth = {
    signInWithPassword: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  };
  const db = { from: vi.fn(() => query), rpc, auth };
  return {
    query,
    execute,
    rpc,
    db,
    auth,
    invite: vi.fn(),
    admin: vi.fn(),
    revalidate: vi.fn(),
    profile: vi.fn(),
    headers: vi.fn(() => new Headers({ 'user-agent': 'Test browser' })),
  };
});
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('../src/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('../src/lib/supabase', () => ({
  supabase: () => Promise.resolve(mocks.db),
  supabaseAdmin: mocks.admin,
  SupabaseConfigurationError: class SupabaseConfigurationError extends Error {},
}));

const inventory = {
  ingredient_id: '00000000-0000-4000-8000-000000000001',
  event_type: 'Adjustment',
  quantity_delta: 2,
  uom: 'lb',
  reason_note: 'Physical count',
  request_id: '00000000-0000-4000-8000-000000000002',
};
const savedId = '00000000-0000-4000-8000-000000000003';
const initial = { ok: false, message: '' };
beforeEach(() => {
  vi.clearAllMocks();
  [
    mocks.query.insert,
    mocks.query.update,
    mocks.query.select,
    mocks.query.eq,
    mocks.query.in,
  ].forEach((method) => method.mockReturnValue(mocks.query));
  mocks.execute.mockResolvedValue({ data: { id: savedId }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.profile.mockResolvedValue({ db: mocks.db, profile: { id: inventory.ingredient_id } });
  mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
  mocks.auth.getUser.mockResolvedValue({ data: { user: { id: savedId } }, error: null });
  mocks.auth.updateUser.mockResolvedValue({ error: null });
  mocks.auth.signOut.mockResolvedValue({ error: null });
  mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ auth: { admin: { inviteUserByEmail: mocks.invite } } });
  mocks.invite.mockResolvedValue({ data: { user: { id: savedId } }, error: null });
});
describe('saved language preference', () => {
  it('rejects unsupported languages before accessing the profile', async () => {
    const form = new FormData();
    form.set('locale', 'fr');
    expect(await setPreferredLocale(form)).toMatchObject({ ok: false });
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
  it.each(['en', 'es'])('saves %s only for the signed-in profile and refreshes the layout', async (locale) => {
    const form = new FormData();
    form.set('locale', locale);
    mocks.execute.mockResolvedValue({
      data: { id: inventory.ingredient_id, preferred_locale: locale }, error: null,
    });
    expect(await setPreferredLocale(form)).toMatchObject({ ok: true });
    expect(mocks.query.update).toHaveBeenCalledWith({ preferred_locale: locale });
    expect(mocks.query.eq).toHaveBeenCalledWith('id', inventory.ingredient_id);
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout');
  });
  it('reports denied writes without changing the visible language', async () => {
    mocks.execute.mockResolvedValue({ data: null, error: { code: '42501', message: 'private' } });
    const form = new FormData();
    form.set('locale', 'es');
    const result = await setPreferredLocale(form);
    expect(result).toMatchObject({ ok: false });
    expect(result.message).not.toContain('private');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('reports interrupted saves instead of claiming success', async () => {
    mocks.execute.mockRejectedValue(new Error('Network unavailable'));
    const form = new FormData();
    form.set('locale', 'en');
    expect(await setPreferredLocale(form)).toMatchObject({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { id: savedId, preferred_locale: 'es' },
    { id: inventory.ingredient_id, preferred_locale: 'en' },
  ])('rejects a missing or mismatched saved preference: %j', async (data) => {
    mocks.execute.mockResolvedValue({ data, error: null });
    const form = new FormData();
    form.set('locale', 'es');
    expect(await setPreferredLocale(form)).toMatchObject({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
describe('server action behavior before restructuring', () => {
  it('rejects unknown actions without writes', async () => {
    expect(await saveRecord('unknown', {})).toMatchObject({ ok: false });
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
  it('denies unauthorized inventory changes', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await saveRecord('inventory', inventory)).toMatchObject({ ok: false });
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
  it('rejects invalid quantities before writing', async () => {
    expect(await saveRecord('inventory', { ...inventory, quantity_delta: 0 })).toMatchObject({
      ok: false,
    });
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
  it('posts the validated inventory payload and refreshes only after success', async () => {
    expect(await saveRecord('inventory', inventory)).toMatchObject({ ok: true, id: savedId });
    expect(mocks.query.insert).toHaveBeenCalledWith(inventory);
    expect(mocks.revalidate).toHaveBeenCalledWith('/app', 'layout');
  });
  it('preserves matching inventory retries without another posting', async () => {
    mocks.execute.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });
    mocks.execute.mockResolvedValueOnce({ data: { ...inventory, id: savedId }, error: null });
    expect(await saveRecord('inventory', inventory)).toMatchObject({ ok: true });
  });
  it('rejects reuse of an inventory token with different values', async () => {
    mocks.execute.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });
    mocks.execute.mockResolvedValueOnce({ data: { ...inventory, quantity_delta: 3 }, error: null });
    expect(await saveRecord('inventory', inventory)).toMatchObject({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('does not expose database messages or refresh after failed writes', async () => {
    mocks.execute.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'private database detail' },
    });
    const result = await saveRecord('inventory', inventory);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('private database');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('rejects invalid login input without calling Auth', async () => {
    expect(await signIn(initial, new FormData())).toMatchObject({ ok: false });
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('keeps the successful login destination', async () => {
    const form = new FormData();
    form.set('identifier', 'user@example.test');
    form.set('password', 'example-password');
    await expect(signIn(initial, form)).rejects.toThrow('REDIRECT:/app');
    expect(mocks.db.from).toHaveBeenCalledWith('login_events');
    expect(mocks.query.insert).toHaveBeenCalledWith({
      event_type: 'signed_in',
      user_agent: 'Test browser',
    });
  });
  it('keeps a successful login available when history recording fails', async () => {
    mocks.execute.mockResolvedValue({ data: null, error: { code: 'LOGIN_EVENT_FAILED', message: 'private' } });
    const form = new FormData();
    form.set('identifier', 'user@example.test');
    form.set('password', 'example-password');
    await expect(signIn(initial, form)).rejects.toThrow('REDIRECT:/app');
  });
  it('keeps the successful sign-out destination', async () => {
    await expect(signOut()).rejects.toThrow('REDIRECT:/login');
  });
  it('preserves password validation and successful reset redirect', async () => {
    expect(await updatePassword(initial, new FormData())).toMatchObject({ ok: false });
    const form = new FormData();
    form.set('password', 'example-password');
    form.set('confirm_password', 'example-password');
    await expect(updatePassword(initial, form)).rejects.toThrow('REDIRECT:/login?reset=success');
  });
});

describe('corrected failure paths', () => {
  it('does not redirect after a failed sign-out', async () => {
    mocks.auth.signOut.mockResolvedValue({ error: { code: 'network_error' } });
    await expect(signOut()).rejects.toThrow('Unable to sign out');
  });
  it('propagates a rejected sign-out without a success redirect', async () => {
    const cause = new Error('transport failed');
    mocks.auth.signOut.mockRejectedValue(cause);
    await expect(signOut()).rejects.toHaveProperty('cause', cause);
  });
  it('does not accept a malformed sign-out result as success', async () => {
    mocks.auth.signOut.mockResolvedValue({});
    await expect(signOut()).rejects.toThrow('Unable to sign out');
  });
  it('does not update a password when session verification fails', async () => {
    mocks.auth.getUser.mockResolvedValue({
      data: { user: { id: savedId } },
      error: { code: 'network_error' },
    });
    const form = new FormData();
    form.set('password', 'example-password');
    form.set('confirm_password', 'example-password');
    expect(await updatePassword(initial, form)).toMatchObject({ ok: false });
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it('reports a changed password separately from a failed sign-out', async () => {
    mocks.auth.signOut.mockResolvedValue({ error: { code: 'network_error' } });
    const form = new FormData();
    form.set('password', 'example-password');
    form.set('confirm_password', 'example-password');
    expect((await updatePassword(initial, form)).message).toContain('password changed');
  });
  it('reports the password change when the sign-out response is lost', async () => {
    mocks.auth.signOut.mockRejectedValue(new Error('Connection lost'));
    const form = new FormData();
    form.set('password', 'example-password');
    form.set('confirm_password', 'example-password');
    expect((await updatePassword(initial, form)).message).toContain('password changed');
  });
  it('does not treat a permission service error as a denial or grant', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: { code: 'network_error' } });
    await expect(saveRecord('inventory', inventory)).rejects.toThrow(
      'Unable to verify permissions',
    );
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
  it('reports a failed duplicate lookup as retryable', async () => {
    mocks.execute.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });
    mocks.execute.mockResolvedValueOnce({
      data: null,
      error: { code: 'network_error', message: 'private detail' },
    });
    expect((await saveRecord('inventory', inventory)).message).toContain('Retry these same values');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('rejects invalid success responses and missing updated records', async () => {
    mocks.execute.mockResolvedValue({ data: null, error: null });
    expect(await saveRecord('inventory', inventory)).toMatchObject({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe('Auth service and invitation failures', () => {
  const reset = () => {
    const form = new FormData();
    form.set('email', 'person@example.test');
    return requestPasswordReset(initial, form);
  };
  it('does not report delivery success when the reset service fails', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: { code: '503' } });
    expect(await reset()).toMatchObject({ ok: false });
  });
  it('keeps reset responses neutral when the service accepts the request', async () => {
    expect(await reset()).toMatchObject({ ok: true });
  });
  const request = {
    id: savedId,
    display_name: 'Test applicant',
    contact_kind: 'email',
    contact_value: 'person@example.test',
    preferred_locale: 'en',
    requested_role: 'reviewer',
    status: 'New',
    review_note: '',
    created_at: '2026-09-19T12:00:00Z',
    auth_user_id: null,
  };
  const approve = () => {
    const form = new FormData();
    form.set('id', savedId);
    form.set('facility_id', inventory.ingredient_id);
    form.set('access_profile_id', inventory.request_id);
    return approveAccessRequest(initial, form);
  };
  const directInvite = () => {
    const form = new FormData();
    form.set('display_name', 'New teammate');
    form.set('email', 'new@example.test');
    form.set('preferred_locale', 'en');
    form.set('facility_id', inventory.ingredient_id);
    form.set('access_profile_id', inventory.request_id);
    return inviteUserFromSettings(initial, form);
  };
  it('creates a recoverable request before sending a direct administrator invitation', async () => {
    mocks.execute.mockResolvedValueOnce({
      data: null, error: null,
    }).mockResolvedValueOnce({
      data: { ...request, display_name: 'New teammate', contact_value: 'new@example.test' }, error: null,
    });
    expect(await directInvite()).toMatchObject({ ok: true });
    expect(mocks.query.insert).toHaveBeenCalledWith({
      display_name: 'New teammate',
      contact_kind: 'email',
      contact_value: 'new@example.test',
      preferred_locale: 'en',
      requested_role: 'reviewer',
    });
    expect(mocks.invite).toHaveBeenCalledWith('new@example.test', expect.anything());
    expect(mocks.rpc).toHaveBeenCalledWith('approve_access_request', {
      request_id: savedId,
      invited_user_id: savedId,
      assigned_facility_id: inventory.ingredient_id,
      assigned_access_profile_id: inventory.request_id,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/user-management/users');
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/user-management/access-requests');
  });
  it('does not send a direct invitation when the email already has an open request', async () => {
    mocks.execute.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } });
    expect(await directInvite()).toMatchObject({ ok: false });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('approve_access_request', expect.anything());
  });
  it('does not mislabel an invitation email delivery failure as an existing account', async () => {
    mocks.execute.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ...request, display_name: 'New teammate', contact_value: 'new@example.test' }, error: null });
    mocks.invite.mockResolvedValue({
      data: { user: null },
      error: { code: 'unexpected_failure', message: 'Error sending invite email' },
    });
    const result = await directInvite();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain('could not deliver');
    expect(result.message).not.toContain('already has');
  });
  it('identifies a genuine existing authentication account', async () => {
    mocks.execute.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ...request, display_name: 'New teammate', contact_value: 'new@example.test' }, error: null });
    mocks.invite.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'User already exists' },
    });
    const result = await directInvite();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain('already has an authentication account');
  });
  it('does not create an invitation for an email that already belongs to a user', async () => {
    mocks.execute.mockResolvedValue({ data: { id: savedId }, error: null });
    const result = await directInvite();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain('already belongs to a user');
    expect(mocks.query.insert).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it('does not create an invitation when the existing-user check fails', async () => {
    mocks.execute.mockResolvedValue({ data: null, error: { code: '503', message: 'private' } });
    const result = await directInvite();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain('Could not check');
    expect(mocks.query.insert).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it('stops before assigning access when saving a successful invitation fails', async () => {
    mocks.execute.mockResolvedValueOnce({ data: request, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '503', message: 'private' } });
    const result = await approve();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invitation sent');
    expect(mocks.rpc).not.toHaveBeenCalledWith('approve_access_request', expect.anything());
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('reuses a saved invitation on retry and preserves a failed assignment', async () => {
    mocks.execute.mockResolvedValue({ data: { ...request, auth_user_id: savedId }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '503' } });
    expect(await approve()).toMatchObject({ ok: false });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await approve()).toMatchObject({ ok: true });
    expect(mocks.invite).not.toHaveBeenCalled();
  });
});

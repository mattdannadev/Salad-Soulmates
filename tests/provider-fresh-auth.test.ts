import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  ProviderFreshAuthError,
  requireRecentProviderOwnerAuthentication,
  validateProviderPasswordClaims,
} from '../src/services/provider-fresh-auth';
import { confirmProviderOwnerPassword } from '../src/app/admin/provider/reauth/actions';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  isOwner: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/data/provider-owner', () => ({ default: mocks.isOwner }));
vi.mock('../src/lib/supabase', () => ({
  supabase: () => Promise.resolve({
    auth: {
      getSession: mocks.getSession,
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  }),
}));

const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const now = 1_800_000_000;
const claims = {
  sub: userId,
  session_id: sessionId,
  role: 'authenticated',
  aud: 'authenticated',
  is_anonymous: false,
  iat: now,
  exp: now + 3600,
  amr: [{ method: 'password', timestamp: now }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date(now * 1000));
  mocks.isOwner.mockResolvedValue(true);
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'current-token' } }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: userId,
        email: 'owner@example.test',
        email_confirmed_at: '2026-09-29T00:00:00Z',
      },
    },
    error: null,
  });
  mocks.signInWithPassword.mockResolvedValue({
    data: {
      user: { id: userId }, session: { access_token: 'current-token' },
    },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('verified Provider Owner password freshness', () => {
  it('accepts exactly 15 minutes and binds proof to the user and session', () => {
    expect(validateProviderPasswordClaims({
      ...claims,
      iat: now - 1,
      amr: [{ method: 'password', timestamp: now - 900 }],
    }, userId, now)).toEqual({
      actorUserId: userId,
      sessionId,
      authenticatedAt: new Date((now - 900) * 1000),
    });
  });

  it.each([
    ['expired password', { amr: [{ method: 'password', timestamp: now - 901 }] }],
    ['refresh event', { amr: [{ method: 'token_refresh', timestamp: now }] }],
    ['recovery event', { amr: [{ method: 'recovery', timestamp: now }] }],
    ['invitation event', { amr: [{ method: 'invite', timestamp: now }] }],
    ['email change event', { amr: [{ method: 'email_change', timestamp: now }] }],
    ['anonymous event', { amr: [{ method: 'anonymous', timestamp: now }] }],
    ['mixed authentication events', { amr: [claims.amr[0], { method: 'token_refresh', timestamp: now }] }],
    ['missing session', { session_id: undefined }],
    ['anonymous claim', { is_anonymous: true }],
    ['future event', { amr: [{ method: 'password', timestamp: now + 1 }] }],
    ['future token issue', { iat: now + 1 }],
    ['expired token', { exp: now }],
    ['malformed timestamp', { amr: [{ method: 'password', timestamp: 'today' }] }],
  ])('rejects %s', (_label, changes) => {
    expect(() => validateProviderPasswordClaims({ ...claims, ...changes }, userId, now))
      .toThrow(ProviderFreshAuthError);
  });

  it('rejects another user or absent claims', () => {
    expect(() => validateProviderPasswordClaims(claims, sessionId, now))
      .toThrow(ProviderFreshAuthError);
    expect(() => validateProviderPasswordClaims(null, userId, now))
      .toThrow(ProviderFreshAuthError);
  });

  it('checks one current token with claims and Auth, then checks live ownership', async () => {
    await expect(requireRecentProviderOwnerAuthentication()).resolves.toMatchObject({
      actorUserId: userId, sessionId,
    });
    expect(mocks.getClaims).toHaveBeenCalledWith('current-token');
    expect(mocks.getUser).toHaveBeenCalledWith('current-token');
    expect(mocks.isOwner).toHaveBeenCalledWith(userId);
  });

  it('denies revoked sessions and missing Owner assignment', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'revoked' } });
    await expect(requireRecentProviderOwnerAuthentication())
      .rejects.toThrow(ProviderFreshAuthError);
    expect(mocks.isOwner).not.toHaveBeenCalled();
    mocks.isOwner.mockResolvedValueOnce(false);
    await expect(requireRecentProviderOwnerAuthentication()).rejects.toThrow('Provider Owner access');
  });

  it('denies missing session without trusting browser state', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(requireRecentProviderOwnerAuthentication())
      .rejects.toThrow(ProviderFreshAuthError);
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});

describe('password confirmation action', () => {
  const previous = { ok: false, message: '' };
  function passwordForm(password = 'correct-password') {
    const form = new FormData();
    form.set('password', password);
    return form;
  }

  it('verifies ownership before signing in and confirms the new session', async () => {
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.test', password: 'correct-password',
    });
    expect(mocks.getClaims).toHaveBeenCalledWith('current-token');
  });

  it('confirms a phone-only Provider Owner using the server verified phone number', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: userId,
          email: null,
          phone: '+13125550101',
          phone_confirmed_at: '2026-09-29T00:00:00Z',
        },
      },
      error: null,
    });
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      phone: '+13125550101', password: 'correct-password',
    });
  });

  it('does not submit a password without a confirmed sign-in identifier', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId, email: 'unconfirmed@example.test' } },
      error: null,
    });
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: false });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a non-owner before submitting any password', async () => {
    mocks.isOwner.mockResolvedValueOnce(false);
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: false });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects failed password sign-in and different returned identity', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'bad password' },
    });
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: false });
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: sessionId }, session: { access_token: 'other-token' },
      },
      error: null,
    });
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: false });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not claim success if the signed session lacks fresh password proof', async () => {
    mocks.getClaims.mockResolvedValueOnce({
      data: { claims: { ...claims, amr: [{ method: 'invite', timestamp: now }] } },
      error: null,
    });
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: false });
  });

  it('does not claim success if the signed-in session was not persisted', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'previous-token' } }, error: null,
    });
    await expect(confirmProviderOwnerPassword(previous, passwordForm()))
      .resolves.toMatchObject({ ok: false });
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});

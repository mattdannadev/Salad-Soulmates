import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import createSupabaseTenantSignupRepository from '@/features/access/infrastructure/supabase-tenant-signup-repository';
import TenantSignupSubmissionError from '@/features/access/infrastructure/tenant-signup-submission-error';

interface RpcResult {
  data: unknown;
  error: { code: string; message: string } | null;
}

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn<() => Promise<RpcResult>>(),
  rpc: vi.fn(),
  supabase: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ supabase: mocks.supabase }));

const request = {
  tenantSlug: 'acme-kitchen',
  displayName: 'Ana Rivera',
  contactKind: 'email' as const,
  contactValue: 'ana@example.test',
  preferredLocale: 'es' as const,
  requestedRole: 'receiver' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supabase.mockResolvedValue({ rpc: mocks.rpc });
  mocks.maybeSingle.mockResolvedValue({
    data: { name: 'Acme Kitchen', slug: 'acme-kitchen' },
    error: null,
  });
  mocks.rpc.mockImplementation((name: string) => (
    name === 'resolve_signup_organization'
      ? { maybeSingle: mocks.maybeSingle }
      : Promise.resolve({ data: '00000000-0000-4000-8000-000000000001', error: null })
  ));
});

describe('Supabase tenant signup adapter', () => {
  it('resolves only the public organization label through the narrow RPC', async () => {
    const repository = createSupabaseTenantSignupRepository();
    await expect(repository.findOrganization('acme-kitchen')).resolves.toEqual({
      name: 'Acme Kitchen', slug: 'acme-kitchen',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_signup_organization', {
      tenant_slug: 'acme-kitchen',
    });
  });

  it('submits normalized fields and a slug without an organization ID', async () => {
    const repository = createSupabaseTenantSignupRepository();
    await repository.submitRequest(request);
    expect(mocks.supabase).toHaveBeenCalledWith({ readOnly: false });
    expect(mocks.rpc).toHaveBeenCalledWith('submit_access_request', {
      tenant_slug: 'acme-kitchen',
      display_name: 'Ana Rivera',
      contact_kind: 'email',
      contact_value: 'ana@example.test',
      preferred_locale: 'es',
      requested_role: 'receiver',
    });
    expect(mocks.rpc.mock.calls[0]?.[1]).not.toHaveProperty('organization_id');
  });

  it.each([
    ['23505', 'duplicate'],
    ['P0001', 'rate_limited'],
    ['P0002', 'unavailable'],
  ] as const)('maps database code %s to %s', async (code, reason) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'private detail' } });
    const repository = createSupabaseTenantSignupRepository();
    await expect(repository.submitRequest(request)).rejects.toMatchObject({
      reason,
    } satisfies Partial<TenantSignupSubmissionError>);
  });

  it('rejects mismatched lookup results instead of accepting an unverified tenant', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { name: 'Another Kitchen', slug: 'another-kitchen' }, error: null,
    });
    const repository = createSupabaseTenantSignupRepository();
    await expect(repository.findOrganization('acme-kitchen')).rejects.toThrow(
      'Unable to load the signup organization',
    );
  });
});

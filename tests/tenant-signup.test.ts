import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import Register from '@/app/register/page';
import TenantRegister from '@/app/register/[organizationSlug]/page';
import requestTenantAccess from '@/app/register/actions';
import {
  findSignupOrganization,
  validateTenantSignupRequest,
} from '@/features/access/application/tenant-signup';
import TenantSignupSubmissionError from '@/features/access/infrastructure/tenant-signup-submission-error';

const mocks = vi.hoisted(() => ({
  findOrganization: vi.fn(),
  submitRequest: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/features/access/infrastructure/supabase-tenant-signup-repository', async (original) => ({
  ...await original<
  typeof import('@/features/access/infrastructure/supabase-tenant-signup-repository')
  >(),
  default: () => ({
    findOrganization: mocks.findOrganization,
    submitRequest: mocks.submitRequest,
  }),
}));
vi.mock('@/app/register/request-access-form', () => ({
  default: ({ organizationSlug }: { organizationSlug: string }) => createElement(
    'form',
    { 'data-organization-slug': organizationSlug },
    'Account request form',
  ),
}));

function validForm() {
  const form = new FormData();
  form.set('display_name', '  Ana Rivera  ');
  form.set('contact', '  ANA@EXAMPLE.TEST  ');
  form.set('preferred_locale', 'es');
  form.set('requested_role', 'receiver');
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOrganization.mockResolvedValue({ name: 'Acme Kitchen', slug: 'acme-kitchen' });
  mocks.submitRequest.mockResolvedValue(undefined);
});

describe('tenant signup application rules', () => {
  it('normalizes contact details while retaining the verified tenant slug', () => {
    expect(validateTenantSignupRequest('acme-kitchen', validForm())).toEqual({
      ok: true,
      request: {
        tenantSlug: 'acme-kitchen',
        displayName: 'Ana Rivera',
        contactKind: 'email',
        contactValue: 'ana@example.test',
        preferredLocale: 'es',
        requestedRole: 'receiver',
      },
    });
    const phoneForm = validForm();
    phoneForm.set('contact', '+1 (312) 555-1234');
    expect(validateTenantSignupRequest('acme-kitchen', phoneForm)).toMatchObject({
      ok: true,
      request: { contactKind: 'phone', contactValue: '+13125551234' },
    });
  });

  it('rejects malformed URL slugs and contact details before data access', async () => {
    expect(validateTenantSignupRequest('Acme Kitchen', validForm())).toMatchObject({ ok: false });
    const invalidContact = validForm();
    invalidContact.set('contact', 'not a contact');
    expect(validateTenantSignupRequest('acme-kitchen', invalidContact)).toMatchObject({ ok: false });
    const repository = {
      findOrganization: mocks.findOrganization,
      submitRequest: mocks.submitRequest,
    };
    expect(await findSignupOrganization(repository, '../acme')).toBeNull();
    expect(mocks.findOrganization).not.toHaveBeenCalled();
  });
});

describe('tenant signup presentation and transport', () => {
  it('renders the resolved organization without exposing an internal organization ID', async () => {
    const html = renderToStaticMarkup(await TenantRegister({
      params: Promise.resolve({ organizationSlug: 'acme-kitchen' }),
      searchParams: Promise.resolve({}),
    }));
    expect(mocks.findOrganization).toHaveBeenCalledWith('acme-kitchen');
    expect(html).toContain('Acme Kitchen');
    expect(html).toContain('data-organization-slug="acme-kitchen"');
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  it('returns not-found for an invalid, unknown, or disabled organization link', async () => {
    mocks.findOrganization.mockResolvedValue(null);
    await expect(TenantRegister({
      params: Promise.resolve({ organizationSlug: 'missing' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('NOT_FOUND');
    await expect(TenantRegister({
      params: Promise.resolve({ organizationSlug: 'INVALID SLUG' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('NOT_FOUND');
  });

  it('keeps the unscoped registration route informational', () => {
    const html = renderToStaticMarkup(Register());
    expect(html).toContain('Organization link required');
    expect(html).not.toContain('Account request form');
  });

  it('submits the slug-derived tenant request through the repository', async () => {
    expect(await requestTenantAccess('acme-kitchen', { ok: false, message: '' }, validForm()))
      .toMatchObject({ ok: true });
    expect(mocks.submitRequest).toHaveBeenCalledWith({
      tenantSlug: 'acme-kitchen',
      displayName: 'Ana Rivera',
      contactKind: 'email',
      contactValue: 'ana@example.test',
      preferredLocale: 'es',
      requestedRole: 'receiver',
    });
  });

  it('maps duplicate, rate-limited, and unavailable submissions to distinct results', async () => {
    mocks.submitRequest.mockRejectedValueOnce(new TenantSignupSubmissionError('duplicate'));
    const duplicate = await requestTenantAccess(
      'acme-kitchen',
      { ok: false, message: '' },
      validForm(),
    );
    expect(duplicate.ok).toBe(true);
    expect(duplicate.message).toContain('already pending');
    mocks.submitRequest.mockRejectedValueOnce(new TenantSignupSubmissionError('rate_limited'));
    const rateLimited = await requestTenantAccess(
      'acme-kitchen',
      { ok: false, message: '' },
      validForm(),
    );
    expect(rateLimited.ok).toBe(false);
    expect(rateLimited.message).toContain('try again in an hour');
    mocks.submitRequest.mockRejectedValueOnce(new TenantSignupSubmissionError('unavailable'));
    const unavailable = await requestTenantAccess(
      'acme-kitchen',
      { ok: false, message: '' },
      validForm(),
    );
    expect(unavailable.ok).toBe(false);
    expect(unavailable.message).toContain('no longer available');
  });

  it('accepts honeypot submissions without calling the repository', async () => {
    const form = validForm();
    form.set('website', 'spam.example');
    expect(await requestTenantAccess('acme-kitchen', { ok: false, message: '' }, form))
      .toEqual({ ok: true, message: 'Request received.' });
    expect(mocks.submitRequest).not.toHaveBeenCalled();
  });
});

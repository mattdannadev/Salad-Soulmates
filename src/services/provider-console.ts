import 'server-only';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { z } from 'zod';
import createProviderConsoleRepository from '@/data/provider-console';
import {
  ProviderCustomerAccountNotFoundError,
  ProviderProvisioningJobNotFoundError,
  ProviderTenantNotFoundError,
  type ProviderConsoleRepository,
} from '@/data/provider-console';
import { operationError } from '@/lib/operation-error';
import { supabase } from '@/lib/supabase';

export interface ProviderTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
  enabledUserCount: number;
  facilityCount: number;
}

export interface ProviderCustomerAccountSummary {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  linkedTenantCount: number;
}

export interface ProviderTenantDetail extends ProviderTenantSummary {
  linkedCustomerAccount?: Pick<ProviderCustomerAccountSummary, 'id' | 'name' | 'status'>;
}

export interface ProviderCustomerAccountDetail extends ProviderCustomerAccountSummary {
  linkedTenants: ProviderTenantSummary[];
}

/** Provisioning completion means invitation delivery, not recipient acceptance. */
export interface ProviderProvisioningJobSummary {
  id: string;
  customerAccount: { id: string; name: string };
  targetOrganization: { id: string; name: string } | null;
  requestedOrganizationName: string;
  requestedOrganizationSlug: string;
  status: 'draft' | 'provisioning' | 'active' | 'failed';
  readinessState: 'not_ready' | 'ready' | 'attention_required';
  offeringType: 'public_cloud';
  requestedAt: string;
  updatedAt: string;
  initialAdminInvitationState: 'not_started' | 'pending' | 'delivered' | 'expired' | 'failed';
  initialAdminInvitationExpiresAt: string | null;
  invitationDeliveredAt: string | null;
  attemptCount: number;
  safeInvitationFailureCode: string | null;
  safeFailureCode: string | null;
}

export class ProviderConsoleAccessError extends Error {}
export {
  ProviderCustomerAccountNotFoundError,
  ProviderProvisioningJobNotFoundError,
  ProviderTenantNotFoundError,
};

async function authenticatedUserId(): Promise<string> {
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) {
    throw operationError('provider_console_auth', 'Unable to verify your session.', error);
  }
  if (!user) throw new ProviderConsoleAccessError('Sign in to access the Provider Console.');
  return user.id;
}

export async function requireProviderPermission(
  permissionCode: string,
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<{ actorUserId: string }> {
  const actorUserId = await authenticatedUserId();
  if (!(await repository.hasPermission(actorUserId, permissionCode))) {
    throw new ProviderConsoleAccessError('Provider permission required.');
  }
  return { actorUserId };
}

export async function listProviderTenants(
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<ProviderTenantSummary[]> {
  const { actorUserId } = await requireProviderPermission('tenants.read', repository);
  const tenants = await repository.listTenants(actorUserId);
  return tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    createdAt: tenant.created_at,
    enabledUserCount: tenant.enabled_user_count,
    facilityCount: tenant.facility_count,
  }));
}

export async function getProviderTenantDetail(
  tenantId: string,
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<ProviderTenantDetail> {
  const parsedTenantId = z.uuid().safeParse(tenantId);
  if (!parsedTenantId.success) throw new ProviderTenantNotFoundError('Provider tenant not found.');
  const { actorUserId } = await requireProviderPermission('tenants.read', repository);
  const tenant = await repository.getTenantDetail(actorUserId, parsedTenantId.data);
  const linkedCustomerAccount = tenant.linked_account_id
    && tenant.linked_account_name
    && tenant.linked_account_status
    ? {
      id: tenant.linked_account_id,
      name: tenant.linked_account_name,
      status: tenant.linked_account_status,
    }
    : undefined;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    createdAt: tenant.created_at,
    enabledUserCount: tenant.enabled_user_count,
    facilityCount: tenant.facility_count,
    linkedCustomerAccount,
  };
}

function customerAccountSummary(record: {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  active_tenant_count: number;
}): ProviderCustomerAccountSummary {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    linkedTenantCount: record.active_tenant_count,
  };
}

function tenantSummary(record: {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  created_at: string;
  enabled_user_count: number;
  facility_count: number;
}): ProviderTenantSummary {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    createdAt: record.created_at,
    enabledUserCount: record.enabled_user_count,
    facilityCount: record.facility_count,
  };
}

export async function listProviderCustomerAccounts(
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<ProviderCustomerAccountSummary[]> {
  const { actorUserId } = await requireProviderPermission('customers.read', repository);
  return (await repository.listCustomerAccounts(actorUserId)).map(customerAccountSummary);
}

export async function getProviderCustomerAccountDetail(
  accountId: string,
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<ProviderCustomerAccountDetail> {
  const parsedAccountId = z.uuid().safeParse(accountId);
  if (!parsedAccountId.success) throw new ProviderCustomerAccountNotFoundError('Provider customer not found.');
  const { actorUserId } = await requireProviderPermission('customers.read', repository);
  if (!(await repository.hasPermission(actorUserId, 'tenants.read'))) {
    throw new ProviderConsoleAccessError('Provider permission required.');
  }
  const [account, tenants] = await Promise.all([
    repository.getCustomerAccount(actorUserId, parsedAccountId.data),
    repository.listCustomerAccountTenants(actorUserId, parsedAccountId.data),
  ]);
  return { ...customerAccountSummary(account), linkedTenants: tenants.map(tenantSummary) };
}

function provisioningJobSummary(record: {
  id: string;
  account_id: string;
  account_name: string;
  organization_id: string | null;
  organization_name: string | null;
  requested_organization_name: string;
  requested_organization_slug: string;
  status: ProviderProvisioningJobSummary['status'];
  readiness_state: ProviderProvisioningJobSummary['readinessState'];
  offering_type: ProviderProvisioningJobSummary['offeringType'];
  requested_at: string;
  updated_at: string;
  initial_admin_invitation_state: ProviderProvisioningJobSummary['initialAdminInvitationState'];
  initial_admin_invitation_expires_at: string | null;
  invitation_delivered_at: string | null;
  attempt_count: number;
  safe_invitation_failure_code: string | null;
  safe_failure_code: string | null;
}): ProviderProvisioningJobSummary {
  return {
    id: record.id,
    customerAccount: { id: record.account_id, name: record.account_name },
    targetOrganization: record.organization_id && record.organization_name
      ? { id: record.organization_id, name: record.organization_name }
      : null,
    requestedOrganizationName: record.requested_organization_name,
    requestedOrganizationSlug: record.requested_organization_slug,
    status: record.status,
    readinessState: record.readiness_state,
    offeringType: record.offering_type,
    requestedAt: record.requested_at,
    updatedAt: record.updated_at,
    initialAdminInvitationState: record.initial_admin_invitation_state,
    initialAdminInvitationExpiresAt: record.initial_admin_invitation_expires_at,
    invitationDeliveredAt: record.invitation_delivered_at,
    attemptCount: record.attempt_count,
    safeInvitationFailureCode: record.safe_invitation_failure_code,
    safeFailureCode: record.safe_failure_code,
  };
}

export async function listProviderProvisioningJobs(
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<ProviderProvisioningJobSummary[]> {
  const { actorUserId } = await requireProviderPermission('provisioning.read', repository);
  return (await repository.listProvisioningJobs(actorUserId)).map(provisioningJobSummary);
}

export async function getProviderProvisioningJob(
  jobId: string,
  repository: ProviderConsoleRepository = createProviderConsoleRepository(),
): Promise<ProviderProvisioningJobSummary> {
  const parsedJobId = z.uuid().safeParse(jobId);
  if (!parsedJobId.success) throw new ProviderProvisioningJobNotFoundError('Provider provisioning job not found.');
  const { actorUserId } = await requireProviderPermission('provisioning.read', repository);
  return provisioningJobSummary(await repository.getProvisioningJob(actorUserId, parsedJobId.data));
}

import 'server-only';
import { z } from 'zod';
import { operationError } from '@/lib/operation-error';
import { supabaseAdmin } from '@/lib/supabase';
import ProviderCustomerAccountNotFoundError from './provider-customer-account-not-found-error';
import ProviderProvisioningJobNotFoundError from './provider-provisioning-job-not-found-error';

export { default as ProviderCustomerAccountNotFoundError } from './provider-customer-account-not-found-error';
export { default as ProviderProvisioningJobNotFoundError } from './provider-provisioning-job-not-found-error';

const providerTenantRecordSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['active', 'suspended']),
  created_at: z.string(),
  enabled_user_count: z.number().int().nonnegative(),
  facility_count: z.number().int().nonnegative(),
  linked_account_id: z.uuid().nullable().optional(),
  linked_account_name: z.string().nullable().optional(),
  linked_account_status: z.enum(['active', 'suspended', 'archived']).nullable().optional(),
});

const providerCustomerAccountRecordSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['active', 'suspended', 'archived']),
  created_at: z.string(),
  active_tenant_count: z.number().int().nonnegative(),
});

const providerProvisioningJobRecordSchema = z.object({
  id: z.uuid(),
  account_id: z.uuid(),
  account_name: z.string(),
  organization_id: z.uuid().nullable(),
  organization_name: z.string().nullable(),
  status: z.enum(['draft', 'provisioning', 'active', 'failed']),
  readiness_state: z.enum(['not_ready', 'ready', 'attention_required']),
  offering_type: z.literal('public_cloud'),
  requested_organization_name: z.string(),
  requested_organization_slug: z.string(),
  requested_at: z.string(),
  updated_at: z.string(),
  initial_admin_invitation_state: z.enum(['not_started', 'pending', 'delivered', 'expired', 'failed']),
  initial_admin_invitation_expires_at: z.string().nullable(),
  invitation_delivered_at: z.string().nullable(),
  attempt_count: z.number().int().nonnegative(),
  safe_invitation_failure_code: z.string().nullable(),
  safe_failure_code: z.string().nullable(),
});

export type ProviderTenantRecord = z.infer<typeof providerTenantRecordSchema>;
export type ProviderCustomerAccountRecord = z.infer<typeof providerCustomerAccountRecordSchema>;
export type ProviderProvisioningJobRecord = z.infer<typeof providerProvisioningJobRecordSchema>;

export class ProviderTenantNotFoundError extends Error {}

export interface ProviderConsoleRepository {
  hasPermission(actorUserId: string, permissionCode: string): Promise<boolean>;
  listTenants(actorUserId: string): Promise<ProviderTenantRecord[]>;
  getTenantDetail(actorUserId: string, tenantId: string): Promise<ProviderTenantRecord>;
  listCustomerAccounts(actorUserId: string): Promise<ProviderCustomerAccountRecord[]>;
  getCustomerAccount(
    actorUserId: string,
    accountId: string,
  ): Promise<ProviderCustomerAccountRecord>;
  listCustomerAccountTenants(
    actorUserId: string,
    accountId: string,
  ): Promise<ProviderTenantRecord[]>;
  listProvisioningJobs(actorUserId: string): Promise<ProviderProvisioningJobRecord[]>;
  getProvisioningJob(actorUserId: string, jobId: string): Promise<ProviderProvisioningJobRecord>;
}

export default function createProviderConsoleRepository(): ProviderConsoleRepository {
  const db = supabaseAdmin();
  return {
    async hasPermission(actorUserId, permissionCode) {
      const { data, error } = await db.rpc('has_provider_permission', {
        actor: actorUserId,
        permission_code: permissionCode,
      });
      if (error) {
        throw operationError(
          'provider_permission_check',
          'Unable to verify provider access.',
          error,
        );
      }
      return z.boolean().parse(data);
    },
    async listTenants(actorUserId) {
      const { data, error } = await db.rpc('list_provider_tenants', { actor: actorUserId });
      if (error) throw operationError('provider_tenants_list', 'Unable to load provider tenants.', error);
      return providerTenantRecordSchema.array().parse(data);
    },
    async getTenantDetail(actorUserId, tenantId) {
      const { data, error } = await db.rpc('get_provider_tenant_detail', {
        actor: actorUserId,
        target_organization_id: tenantId,
      });
      if (error?.code === 'P0002') throw new ProviderTenantNotFoundError('Provider tenant not found.');
      if (error) throw operationError('provider_tenant_detail', 'Unable to load provider tenant.', error);
      const [tenant] = providerTenantRecordSchema.array().length(1).parse(data);
      if (!tenant) throw new ProviderTenantNotFoundError('Provider tenant not found.');
      return tenant;
    },
    async listCustomerAccounts(actorUserId) {
      const { data, error } = await db.rpc('list_provider_customer_accounts', {
        actor: actorUserId,
      });
      if (error) {
        throw operationError(
          'provider_customer_accounts_list',
          'Unable to load provider customers.',
          error,
        );
      }
      return providerCustomerAccountRecordSchema.array().parse(data);
    },
    async getCustomerAccount(actorUserId, accountId) {
      const { data, error } = await db.rpc('get_provider_customer_account', {
        actor: actorUserId,
        target_account_id: accountId,
      });
      if (error?.code === 'P0002') throw new ProviderCustomerAccountNotFoundError('Provider customer not found.');
      if (error) {
        throw operationError(
          'provider_customer_account_detail',
          'Unable to load provider customer.',
          error,
        );
      }
      const [account] = providerCustomerAccountRecordSchema.array().length(1).parse(data);
      if (!account) throw new ProviderCustomerAccountNotFoundError('Provider customer not found.');
      return account;
    },
    async listCustomerAccountTenants(actorUserId, accountId) {
      const { data, error } = await db.rpc('list_provider_customer_account_tenants', {
        actor: actorUserId,
        target_account_id: accountId,
      });
      if (error?.code === 'P0002') throw new ProviderCustomerAccountNotFoundError('Provider customer not found.');
      if (error) {
        throw operationError(
          'provider_customer_account_tenants',
          'Unable to load customer tenants.',
          error,
        );
      }
      return providerTenantRecordSchema.array().parse(data);
    },
    async listProvisioningJobs(actorUserId) {
      const { data, error } = await db.rpc('list_provider_provisioning_jobs', {
        actor: actorUserId,
      });
      if (error) {
        throw operationError(
          'provider_provisioning_jobs_list',
          'Unable to load provisioning jobs.',
          error,
        );
      }
      return providerProvisioningJobRecordSchema.array().parse(data);
    },
    async getProvisioningJob(actorUserId, jobId) {
      const { data, error } = await db.rpc('get_provider_provisioning_job', {
        actor: actorUserId,
        target_job_id: jobId,
      });
      if (error?.code === 'P0002') throw new ProviderProvisioningJobNotFoundError('Provider provisioning job not found.');
      if (error) {
        throw operationError(
          'provider_provisioning_job_detail',
          'Unable to load provisioning job.',
          error,
        );
      }
      const [job] = providerProvisioningJobRecordSchema.array().length(1).parse(data);
      if (!job) throw new ProviderProvisioningJobNotFoundError('Provider provisioning job not found.');
      return job;
    },
  };
}

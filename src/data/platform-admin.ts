import 'server-only';
import { z } from 'zod';
import { operationError } from '@/lib/operation-error';
import { supabaseAdmin } from '@/lib/supabase';

const organizationRecordSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['active', 'suspended']),
  signup_enabled: z.boolean(),
  operations_copilot_plan_enabled: z.boolean(),
  enabled_user_count: z.number().int().nonnegative(),
  created_at: z.string(),
});

export type OrganizationRecord = z.infer<typeof organizationRecordSchema>;

export interface PlatformAdminRepository {
  isPlatformAdmin(userId: string): Promise<boolean>;
  listOrganizations(actorUserId: string): Promise<OrganizationRecord[]>;
  provisionOrganization(actorUserId: string, input: {
    name: string; slug: string; facilityName: string; timezone: string;
  }): Promise<string>;
  setOrganizationSuspended(actorUserId: string, input: {
    organizationId: string; suspended: boolean; reason: string;
  }): Promise<void>;
  setOperationsCopilotPlan(actorUserId: string, input: {
    organizationId: string; enabled: boolean; reason: string;
  }): Promise<void>;
}

export default function createPlatformAdminRepository(): PlatformAdminRepository {
  const db = supabaseAdmin();
  return {
    async isPlatformAdmin(userId) {
      const { data, error } = await db.from('platform_admins')
        .select('user_id').eq('user_id', userId).maybeSingle();
      if (error) throw operationError('platform_admin_membership', 'Unable to verify platform access.', error);
      return data !== null;
    },
    async listOrganizations(actorUserId) {
      const { data, error } = await db.rpc('list_platform_organizations', {
        actor_user_id: actorUserId,
      });
      if (error) throw operationError('platform_organizations_list', 'Unable to load organizations.', error);
      return organizationRecordSchema.array().parse(data);
    },
    async provisionOrganization(actorUserId, input) {
      const { data, error } = await db.rpc('provision_platform_organization', {
        actor_user_id: actorUserId,
        organization_name: input.name,
        organization_slug: input.slug,
        facility_name: input.facilityName,
        facility_timezone: input.timezone,
      });
      if (error) throw operationError('platform_organization_provision', 'Unable to create organization.', error);
      return z.uuid().parse(data);
    },
    async setOrganizationSuspended(actorUserId, input) {
      const { error } = await db.rpc('set_platform_organization_suspended', {
        actor_user_id: actorUserId,
        target_organization_id: input.organizationId,
        should_suspend: input.suspended,
        reason: input.reason,
      });
      if (error) throw operationError('platform_organization_status', 'Unable to change organization status.', error);
    },
    async setOperationsCopilotPlan(actorUserId, input) {
      const { error } = await db.rpc('set_platform_operations_copilot_plan', {
        actor_user_id: actorUserId,
        target_organization_id: input.organizationId,
        plan_enabled: input.enabled,
        reason: input.reason,
      });
      if (error) {
        throw operationError(
          'platform_operations_copilot_plan',
          'Unable to change Operations Copilot plan access.',
          error,
        );
      }
    },
  };
}

import 'server-only';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { z } from 'zod';
import createPlatformAdminRepository from '@/data/platform-admin';
import type { PlatformAdminRepository } from '@/data/platform-admin';
import { operationError } from '@/lib/operation-error';
import { supabase } from '@/lib/supabase';

const provisionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  facilityName: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(100),
});
const statusSchema = z.object({
  organizationId: z.uuid(),
  suspended: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});
const operationsCopilotPlanSchema = z.object({
  organizationId: z.uuid(),
  enabled: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  signupEnabled: boolean;
  operationsCopilotPlanEnabled: boolean;
  enabledUserCount: number;
  createdAt: string;
}

export class PlatformAdminAccessError extends Error {}

async function authenticatedUserId(): Promise<string> {
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) {
    throw operationError('platform_admin_auth', 'Unable to verify your session.', error);
  }
  if (!user) throw new PlatformAdminAccessError('Sign in to access platform administration.');
  return user.id;
}

export async function requirePlatformAdmin(
  repository: PlatformAdminRepository = createPlatformAdminRepository(),
): Promise<{ actorUserId: string }> {
  const actorUserId = await authenticatedUserId();
  if (!(await repository.isPlatformAdmin(actorUserId))) {
    throw new PlatformAdminAccessError('Platform administrator access required.');
  }
  return { actorUserId };
}

/** Routes platform operators to their portal after sign-in; tenant users keep their workspace. */
export async function postSignInDestination(
  repository: PlatformAdminRepository = createPlatformAdminRepository(),
): Promise<'/admin' | '/app'> {
  const actorUserId = await authenticatedUserId();
  return (await repository.isPlatformAdmin(actorUserId)) ? '/admin' : '/app';
}

export async function listOrganizations(
  repository: PlatformAdminRepository = createPlatformAdminRepository(),
): Promise<OrganizationSummary[]> {
  const { actorUserId } = await requirePlatformAdmin(repository);
  const organizations = await repository.listOrganizations(actorUserId);
  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    signupEnabled: organization.signup_enabled,
    operationsCopilotPlanEnabled: organization.operations_copilot_plan_enabled,
    enabledUserCount: organization.enabled_user_count,
    createdAt: organization.created_at,
  }));
}

export async function provisionOrganization(
  input: unknown,
  repository: PlatformAdminRepository = createPlatformAdminRepository(),
): Promise<string> {
  const { actorUserId } = await requirePlatformAdmin(repository);
  return repository.provisionOrganization(actorUserId, provisionSchema.parse(input));
}

export async function setOrganizationSuspended(
  input: unknown,
  repository: PlatformAdminRepository = createPlatformAdminRepository(),
): Promise<void> {
  const { actorUserId } = await requirePlatformAdmin(repository);
  await repository.setOrganizationSuspended(actorUserId, statusSchema.parse(input));
}

/** Changes the paid-plan ceiling after rechecking platform authority server-side. */
export async function setOperationsCopilotPlan(
  input: unknown,
  repository: PlatformAdminRepository = createPlatformAdminRepository(),
): Promise<void> {
  const { actorUserId } = await requirePlatformAdmin(repository);
  await repository.setOperationsCopilotPlan(
    actorUserId,
    operationsCopilotPlanSchema.parse(input),
  );
}

import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { operationError } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

export const userDirectoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional()
    .default(''),
  sort: z.enum(['first_name', 'last_name']).optional().default('last_name'),
});

export type UserDirectoryQuery = z.infer<typeof userDirectoryQuerySchema>;

const managedProfileSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  access_profile_id: z.uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  display_name: z.string(),
  work_email: z.email().nullable(),
  role: z.string(),
  preferred_locale: z.enum(['en', 'es']),
  active: z.boolean(),
  deactivated_at: z.string().nullable(),
  deactivated_by: z.uuid().nullable(),
  deactivation_reason: z.string().nullable(),
});

const facilitySchema = z.object({ id: z.uuid(), name: z.string() });
const accessProfileSchema = z.object({ id: z.uuid(), name: z.string(), active: z.boolean() });
const loginEventSchema = z.object({
  id: z.uuid(),
  event_type: z.enum(['signed_in', 'signed_out']),
  occurred_at: z.string(),
});

export interface ManagedUser {
  id: string;
  accessProfileId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  workEmail: string | null;
  facilityName: string;
  accessProfileName: string;
  role: string;
  preferredLocale: 'en' | 'es';
  active: boolean;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
}

export interface ManagedUserDetail extends ManagedUser {
  loginHistory: z.infer<typeof loginEventSchema>[] | null;
}

export interface AccessProfileOption {
  id: string;
  name: string;
}

interface UserManagementContext {
  db: Awaited<ReturnType<typeof requireAdminShell>>['db'];
  actorUserId: string;
}

async function requireUserManagement(): Promise<UserManagementContext> {
  const { db, profile } = await requireAdminShell();
  if (!(await hasPermission(db, 'access.manage'))) redirect('/app');
  return { db, actorUserId: profile.id };
}

function readResult<T>(
  result: { data: unknown; error: unknown },
  schema: z.ZodType<T>,
  operation: string,
): T {
  if (result.error) {
    throw operationError(operation, 'Unable to load user management records.', result.error);
  }
  return schema.parse(result.data);
}

function combineUser(
  profile: z.infer<typeof managedProfileSchema>,
  facilities: ReadonlyMap<string, string>,
  accessProfiles: ReadonlyMap<string, string>,
): ManagedUser {
  return {
    id: profile.id,
    accessProfileId: profile.access_profile_id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    displayName: profile.display_name,
    workEmail: profile.work_email,
    facilityName: facilities.get(profile.facility_id) ?? 'Facility unavailable',
    accessProfileName: accessProfiles.get(profile.access_profile_id) ?? 'Access profile unavailable',
    role: profile.role,
    preferredLocale: profile.preferred_locale,
    active: profile.active,
    deactivatedAt: profile.deactivated_at,
    deactivatedBy: profile.deactivated_by,
    deactivationReason: profile.deactivation_reason,
  };
}

export function filterAndSortUsers(
  users: readonly ManagedUser[],
  query: UserDirectoryQuery,
): ManagedUser[] {
  const search = query.q.toLocaleLowerCase();
  const filtered = search
    ? users.filter((user) => [
      user.firstName,
      user.lastName,
      user.displayName,
      user.workEmail ?? '',
      user.facilityName,
      user.accessProfileName,
    ].some((value) => value.toLocaleLowerCase().includes(search)))
    : [...users];
  const firstKey = query.sort === 'first_name' ? 'firstName' : 'lastName';
  const secondKey = query.sort === 'first_name' ? 'lastName' : 'firstName';
  return filtered.toSorted((left, right) => (
    left[firstKey].localeCompare(right[firstKey], undefined, { sensitivity: 'base' })
      || left[secondKey].localeCompare(right[secondKey], undefined, { sensitivity: 'base' })
      || left.id.localeCompare(right.id)
  ));
}

async function loadReferenceNames(db: UserManagementContext['db']) {
  const [facilitiesResult, accessProfilesResult] = await Promise.all([
    db.from('facilities').select('id,name').order('name'),
    db.from('access_profiles').select('id,name,active').order('name'),
  ]);
  const facilities = readResult(
    facilitiesResult,
    facilitySchema.array(),
    'user_management_facilities',
  );
  const accessProfiles = readResult(
    accessProfilesResult,
    accessProfileSchema.array(),
    'user_management_access_profiles',
  );
  return {
    facilities: new Map(facilities.map((facility) => [facility.id, facility.name])),
    accessProfiles: new Map(accessProfiles.map((profile) => [profile.id, profile.name])),
    activeAccessProfileIds: new Set(
      accessProfiles.filter((profile) => profile.active).map((profile) => profile.id),
    ),
  };
}

export async function loadUserDirectory(query: UserDirectoryQuery) {
  const context = await requireUserManagement();
  const [profilesResult, references] = await Promise.all([
    context.db
      .from('profiles')
      .select('id,organization_id,facility_id,access_profile_id,first_name,last_name,display_name,work_email,role,preferred_locale,active,deactivated_at,deactivated_by,deactivation_reason')
      .order('last_name')
      .order('first_name'),
    loadReferenceNames(context.db),
  ]);
  const profiles = readResult(
    profilesResult,
    managedProfileSchema.array(),
    'user_management_profiles',
  );
  const users = profiles.map((profile) => combineUser(
    profile,
    references.facilities,
    references.accessProfiles,
  ));
  return {
    users: filterAndSortUsers(users, query),
    totalUsers: users.length,
    actorUserId: context.actorUserId,
  };
}

export async function loadManagedUser(userId: string): Promise<{
  user: ManagedUserDetail;
  actorUserId: string;
  accessProfiles: AccessProfileOption[];
}> {
  const parsedUserId = z.uuid().safeParse(userId);
  if (!parsedUserId.success) notFound();
  const context = await requireUserManagement();
  const canReadAudit = await hasPermission(context.db, 'audit.read');
  const [profileResult, references, loginResult] = await Promise.all([
    context.db
      .from('profiles')
      .select('id,organization_id,facility_id,access_profile_id,first_name,last_name,display_name,work_email,role,preferred_locale,active,deactivated_at,deactivated_by,deactivation_reason')
      .eq('id', parsedUserId.data)
      .maybeSingle(),
    loadReferenceNames(context.db),
    canReadAudit
      ? context.db
        .from('login_events')
        .select('id,event_type,occurred_at')
        .eq('user_id', parsedUserId.data)
        .order('occurred_at', { ascending: false })
        .limit(10)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (profileResult.error) {
    throw operationError(
      'user_management_profile',
      'Unable to load this user profile.',
      profileResult.error,
    );
  }
  if (!profileResult.data) notFound();
  const profile = managedProfileSchema.parse(profileResult.data);
  const loginHistory = canReadAudit
    ? readResult(loginResult, loginEventSchema.array(), 'user_management_login_history')
    : null;
  return {
    actorUserId: context.actorUserId,
    accessProfiles: [...references.accessProfiles]
      .filter(([id]) => references.activeAccessProfileIds.has(id))
      .map(([id, name]) => ({ id, name })),
    user: {
      ...combineUser(profile, references.facilities, references.accessProfiles),
      loginHistory,
    },
  };
}

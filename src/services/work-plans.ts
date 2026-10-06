import 'server-only';

import { z } from 'zod';
import releaseWorkPlanVersionRecord, {
  createWorkPlanRecord, saveWorkPlanDraftRecord,
  createWorkPlanDraftVersionRecord,
  listWorkPlanVersionRecords,
  transitionWorkPlanVersionRecord,
} from '@/data/work-plans';
import type { ActionResult } from '@/domain/master-data';
import {
  createWorkPlanSchema, releaseWorkPlanVersionSchema, saveWorkPlanDraftSchema,
  createWorkPlanDraftVersionSchema,
  workPlanVersionsSchema, type WorkPlanVersionSummary,
  transitionWorkPlanVersionSchema,
} from '@/domain/work-plans';
import { requireAdminShell, requireProfile } from '@/lib/auth';
import { logFailure, operationError } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

/** Authorize and validate the read-only Work Plan management workspace. */
export async function loadWorkPlanWorkspace(): Promise<{
  canManage: boolean;
  actorId: string;
  locale: 'en' | 'es';
  versions: WorkPlanVersionSummary[];
}> {
  const { db, profile } = await requireAdminShell();
  const locale = profile.preferred_locale;
  if (!await hasPermission(db, 'settings.manage')
    || !await hasPermission(db, 'operations.work_plans.manage')) {
    return {
      canManage: false, actorId: profile.id, locale, versions: [],
    };
  }
  let result;
  try {
    result = await listWorkPlanVersionRecords(db);
  } catch (error) {
    throw operationError('work_plan_versions_load', 'Unable to load Work Plans.', error);
  }
  if (result.error) {
    throw operationError('work_plan_versions_load', 'Unable to load Work Plans.', result.error);
  }
  const versions = workPlanVersionsSchema.safeParse(result.data);
  if (!versions.success) {
    throw operationError('work_plan_versions_load', 'Unable to load Work Plans.', versions.error);
  }
  return {
    canManage: true, actorId: profile.id, locale, versions: versions.data,
  };
}

/** Authorize and release a fully defined Work Plan version exactly once. */
export default async function releaseWorkPlanVersion(input: unknown): Promise<ActionResult> {
  const parsed = releaseWorkPlanVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Choose a current Work Plan version.' };
  }
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'settings.manage')
    || !await hasPermission(db, 'operations.work_plans.manage')) {
    return { ok: false, message: 'Work Plan management access is required.' };
  }
  try {
    const result = await releaseWorkPlanVersionRecord(db, parsed.data);
    if (result.error) {
      logFailure('work_plan_version_release', result.error);
      const known = [
        'Work Plan version unavailable',
        'Work Plan version changed; reload and try again',
        'Only draft or review Work Plan versions can be released',
        'A Work Plan version needs at least one step',
        'Work Plan dependencies cannot contain a cycle',
      ];
      return {
        ok: false,
        message: known.find((message) => result.error.message.includes(message))
          ?? 'Unable to release this Work Plan version. Reload and try again.',
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Work Plan version released.' }
      : { ok: false, message: 'The release could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('work_plan_version_release', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

/** Authorize creation of a complete draft Work Plan version. */
export async function createWorkPlan(input: unknown): Promise<ActionResult> {
  const parsed = createWorkPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Enter a valid Work Plan definition.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'settings.manage')
    || !await hasPermission(db, 'operations.work_plans.manage')) {
    return { ok: false, message: 'Work Plan management access is required.' };
  }
  try {
    const result = await createWorkPlanRecord(db, parsed.data);
    if (result.error) {
      logFailure('work_plan_create', result.error);
      return {
        ok: false,
        message: result.error.code === '23505' || result.error.message.includes('already exists')
          ? 'A Work Plan already uses that code.'
          : 'Unable to create this Work Plan. Reload and try again.',
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Work Plan draft created.' }
      : { ok: false, message: 'The Work Plan could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('work_plan_create', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

/** Authorize an optimistic, draft-only replacement of plan definition content. */
export async function saveWorkPlanDraft(input: unknown): Promise<ActionResult> {
  const parsed = saveWorkPlanDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Enter a valid Work Plan definition.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'settings.manage')
    || !await hasPermission(db, 'operations.work_plans.manage')) {
    return { ok: false, message: 'Work Plan management access is required.' };
  }
  try {
    const result = await saveWorkPlanDraftRecord(db, parsed.data);
    if (result.error) {
      logFailure('work_plan_draft_save', result.error);
      return {
        ok: false,
        message: result.error.message.includes('changed; reload')
          ? 'Work Plan version changed; reload and try again.'
          : 'Unable to save this Work Plan draft. Reload and try again.',
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Work Plan draft saved.' }
      : { ok: false, message: 'The Work Plan draft could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('work_plan_draft_save', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

export async function createWorkPlanDraftVersion(input: unknown): Promise<ActionResult> {
  const parsed = createWorkPlanDraftVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid Work Plan.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'settings.manage') || !await hasPermission(db, 'operations.work_plans.manage')) {
    return { ok: false, message: 'Work Plan management access is required.' };
  }
  try {
    const result = await createWorkPlanDraftVersionRecord(db, parsed.data);
    if (result.error) {
      logFailure('work_plan_draft_version_create', result.error);
      return { ok: false, message: 'Unable to create a new Work Plan version.' };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'New Work Plan draft created.' }
      : { ok: false, message: 'The new Work Plan version could not be confirmed.' };
  } catch (error) {
    logFailure('work_plan_draft_version_create', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

/** Change lifecycle metadata without changing definition content or release evidence. */
export async function transitionWorkPlanVersion(input: unknown): Promise<ActionResult> {
  const parsed = transitionWorkPlanVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a current Work Plan version.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'settings.manage') || !await hasPermission(db, 'operations.work_plans.manage')) {
    return { ok: false, message: 'Work Plan management access is required.' };
  }
  try {
    const result = await transitionWorkPlanVersionRecord(db, parsed.data);
    if (result.error) {
      logFailure('work_plan_version_transition', result.error);
      return {
        ok: false,
        message: result.error.message.includes('changed; reload')
          ? 'Work Plan version changed; reload and try again.'
          : 'Unable to change this Work Plan lifecycle. Reload and try again.',
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Work Plan lifecycle updated.' }
      : { ok: false, message: 'Unable to change this Work Plan lifecycle. Reload and try again.' };
  } catch (error) {
    logFailure('work_plan_version_transition', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

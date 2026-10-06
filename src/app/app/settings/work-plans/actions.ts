'use server';

import { revalidatePath } from 'next/cache';
import releaseWorkPlanVersion, {
  createWorkPlan, createWorkPlanDraftVersion, saveWorkPlanDraft,
  transitionWorkPlanVersion,
} from '@/services/work-plans';

export async function createWorkPlanAction(input: unknown) {
  const result = await createWorkPlan(input);
  if (result.ok) revalidatePath('/app/settings/work-plans');
  return result;
}

export async function releaseWorkPlanVersionAction(input: unknown) {
  const result = await releaseWorkPlanVersion(input);
  if (result.ok) revalidatePath('/app/settings/work-plans');
  return result;
}

export async function saveWorkPlanDraftAction(input: unknown) {
  const result = await saveWorkPlanDraft(input);
  if (result.ok) revalidatePath('/app/settings/work-plans');
  return result;
}

export async function createWorkPlanDraftVersionAction(input: unknown) {
  const result = await createWorkPlanDraftVersion(input);
  if (result.ok) revalidatePath('/app/settings/work-plans');
  return result;
}

export async function transitionWorkPlanVersionAction(input: unknown) {
  const result = await transitionWorkPlanVersion(input);
  if (result.ok) revalidatePath('/app/settings/work-plans');
  return result;
}

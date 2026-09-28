'use server';

import { revalidatePath } from 'next/cache';
import {
  publishScheduleInputSchema, scheduleAvailabilityInputSchema, scheduleDeleteInputSchema,
  scheduleEventInputSchema, schedulePtoInputSchema, scheduleSettingsInputSchema,
} from '@/domain/scheduling';
import type { ActionResult } from '@/domain/master-data';
import { commitScheduleMutation } from '@/services/scheduling';

async function runScheduleMutation(
  operation: 'save_workforce_schedule_event' | 'delete_workforce_schedule_event'
    | 'save_facility_schedule_settings' | 'publish_workforce_schedule'
    | 'save_workforce_pto' | 'cancel_workforce_pto' | 'save_workforce_availability',
  payload: { facility_id: string },
  requiredPermission: 'workforce.manage' | 'settings.manage',
): Promise<ActionResult> {
  const result = await commitScheduleMutation(operation, payload, requiredPermission);
  if (result.ok) {
    revalidatePath('/app/scheduling');
    revalidatePath('/worker');
  }
  return result;
}

export async function saveScheduleEvent(input: unknown): Promise<ActionResult> {
  const parsed = scheduleEventInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check schedule details.' };
  return runScheduleMutation('save_workforce_schedule_event', parsed.data, 'workforce.manage');
}

export async function deleteScheduleEvent(input: unknown): Promise<ActionResult> {
  const parsed = scheduleDeleteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check schedule selection.' };
  return runScheduleMutation('delete_workforce_schedule_event', parsed.data, 'workforce.manage');
}

export async function saveFacilitySchedulingSettings(input: unknown): Promise<ActionResult> {
  const parsed = scheduleSettingsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check weekly capacity.' };
  return runScheduleMutation('save_facility_schedule_settings', parsed.data, 'settings.manage');
}

export async function publishSchedule(input: unknown): Promise<ActionResult> {
  const parsed = publishScheduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check schedule revision.' };
  return runScheduleMutation('publish_workforce_schedule', parsed.data, 'workforce.manage');
}

export async function saveSchedulePto(input: unknown): Promise<ActionResult> {
  const parsed = schedulePtoInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check PTO details.' };
  return runScheduleMutation('save_workforce_pto', parsed.data, 'workforce.manage');
}

export async function cancelSchedulePto(input: unknown): Promise<ActionResult> {
  const parsed = scheduleDeleteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check PTO selection.' };
  return runScheduleMutation('cancel_workforce_pto', parsed.data, 'workforce.manage');
}

export async function saveScheduleAvailability(input: unknown): Promise<ActionResult> {
  const parsed = scheduleAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check available days.' };
  return runScheduleMutation('save_workforce_availability', parsed.data, 'workforce.manage');
}

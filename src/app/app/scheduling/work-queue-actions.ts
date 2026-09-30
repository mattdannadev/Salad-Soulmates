'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/domain/master-data';
import {
  createScheduledWorkQueueItem, publishScheduledWorkQueue,
} from '@/services/work-queue';

export async function createSchedulerWorkQueueItem(input: unknown): Promise<ActionResult> {
  const result = await createScheduledWorkQueueItem(input);
  if (result.ok) revalidatePath('/app/scheduling');
  return result;
}

export async function publishSchedulerWorkQueue(input: unknown): Promise<ActionResult> {
  const result = await publishScheduledWorkQueue(input);
  if (result.ok) {
    revalidatePath('/app/scheduling');
    revalidatePath('/worker');
  }
  return result;
}

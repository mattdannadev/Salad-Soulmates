'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/domain/master-data';
import { claimPublishedWorkQueueItem } from '@/services/work-queue';

export default async function claimWorkerQueueItem(input: unknown): Promise<ActionResult> {
  const result = await claimPublishedWorkQueueItem(input);
  if (result.ok) revalidatePath('/worker');
  return result;
}

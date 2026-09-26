'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/domain/master-data';
import saveBatchWorksheetService from '@/services/batch-worksheet';

export default async function saveBatchWorksheet(
  operation: unknown,
  input: unknown,
): Promise<ActionResult> {
  const result = await saveBatchWorksheetService(operation, input);
  if (result.ok) {
    revalidatePath('/worker');
    revalidatePath('/app/orders');
    revalidatePath('/app/inventory');
  }
  return result;
}

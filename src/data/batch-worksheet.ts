import 'server-only';

import type { Json } from '@/lib/database.types';
import type { supabase } from '@/lib/supabase';

export type WorksheetOperation = 'open' | 'use' | 'correct' | 'issue' | 'complete';

/** Persistence boundary for the atomic worksheet RPCs. */
export async function saveWorksheetRecord(
  db: Awaited<ReturnType<typeof supabase>>,
  operation: WorksheetOperation,
  input: Json,
) {
  if (operation === 'use') return db.rpc('record_batch_worksheet_usage', { payload: input });
  if (operation === 'correct') return db.rpc('correct_batch_worksheet_usage', { payload: input });
  if (operation === 'issue') return db.rpc('report_spice_preparation_issue', { payload: input });
  if (operation === 'open') return db.rpc('open_batch_worksheet', { batch_id: input as string });
  return db.rpc('complete_batch_worksheet', { execution_id: input as string });
}

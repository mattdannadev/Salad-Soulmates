import 'server-only';

import fetchWorkerPreparations from '@/data/worker-preparations';
import { workerPreparationsSchema } from '@/domain/worker-preparations';
import { readResult } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import type { supabase } from '@/lib/supabase';

/** Return permitted, validated preparations in work order; null means access is denied. */
export default async function loadWorkerPreparations(db: Awaited<ReturnType<typeof supabase>>) {
  if (!await hasPermission(db, 'production.mobile')) return null;
  return readResult(
    await fetchWorkerPreparations(db),
    workerPreparationsSchema,
    'worker_spice_preparations',
  ).toSorted((a, b) => a.assigned_on.localeCompare(b.assigned_on)
    || a.product_name.localeCompare(b.product_name) || a.sequence - b.sequence);
}

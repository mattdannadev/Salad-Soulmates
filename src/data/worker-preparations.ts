import 'server-only';

import type { supabase } from '@/lib/supabase';

/** Fetch the facility-scoped worker view through its authorized RPC. */
export default function fetchWorkerPreparations(db: Awaited<ReturnType<typeof supabase>>) {
  return db.rpc('worker_spice_preparations');
}

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import fetchWorkerPreparations from '@/data/worker-preparations';
import type { Database } from '@/lib/database.types';
import loadPurchaseReceivingData from '@/lib/purchase-receiving-data';

/**
 * Reuse the worker RPC and receiving read model so mobile summaries inherit
 * their existing RLS, tenant, facility, and validation boundaries.
 */
export function fetchMobileWorkerPreparations(db: SupabaseClient<Database>) {
  return fetchWorkerPreparations(db);
}

export async function fetchMobileReceivingOrders(db: SupabaseClient<Database>) {
  return (await loadPurchaseReceivingData(db)).orders;
}

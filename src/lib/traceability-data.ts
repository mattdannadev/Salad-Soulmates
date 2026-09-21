import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { backwardTraceSchema, forwardTraceSchema, productionLotSearchSchema } from '@/domain/traceability';
import type { Database } from './database.types';
import { readResult } from './data';

const rpcPageSize = 100;

/** Load a bounded, authorization-checked production-lot search result. */
export async function findProductionLots(
  db: SupabaseClient<Database>,
  productId: string,
  lotCode: string,
) {
  return readResult(
    await db.rpc('find_traceability_production_lots', {
      product_filter: productId,
      production_lot_code_filter: lotCode,
      page_number: 0,
      requested_page_size: rpcPageSize,
    }),
    productionLotSearchSchema,
    'find_traceability_production_lots',
  );
}

/** Resolve recorded material edges backwards from one internal production-lot identity. */
export async function loadBackwardTrace(
  db: SupabaseClient<Database>,
  productionLotId: string,
) {
  return readResult(
    await db.rpc('trace_production_lot', {
      production_lot_filter: productionLotId,
      page_number: 0,
      requested_page_size: rpcPageSize,
    }),
    backwardTraceSchema,
    'trace_production_lot',
  );
}

/** Resolve affected batches for a receipt-scoped source lot or exact serialized package. */
export async function loadForwardTrace(
  db: SupabaseClient<Database>,
  sourceLot: string | undefined,
  packageId: string | undefined,
) {
  return readResult(
    await db.rpc('trace_source_material', {
      source_lot_filter: sourceLot ?? null,
      serialized_unit_filter: packageId ?? null,
      page_number: 0,
      requested_page_size: rpcPageSize,
    }),
    forwardTraceSchema,
    'trace_source_material',
  );
}

export const traceabilityProductSchema = z.object({ id: z.uuid(), name: z.string() });

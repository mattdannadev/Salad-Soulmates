import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowSchemas } from '@/domain/master-data';
import {
  purchaseDraftRowSchema,
  purchaseLineRowSchema,
} from '@/domain/purchasing';
import { buildPurchaseReceivingOrders } from '@/domain/purchase-receiving';
import type { Database } from './database.types';
import { rows } from './data';

/** Load the complete RLS-scoped purchasing read model with explicit pagination. */
export default async function loadPurchaseReceivingData(db: SupabaseClient<Database>) {
  const [drafts, purchaseLines, receiptLines, suppliers] = await Promise.all([
    rows(db, 'purchase_drafts', purchaseDraftRowSchema),
    rows(db, 'purchase_draft_lines', purchaseLineRowSchema),
    rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
    rows(db, 'suppliers', rowSchemas.suppliers),
  ]);
  return {
    drafts,
    purchaseLines,
    receiptLines,
    suppliers,
    orders: buildPurchaseReceivingOrders(drafts, purchaseLines, receiptLines, suppliers),
  };
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import inventoryBalances from '@/domain/inventory';
import { ingredientReferenceQuantities } from '@/domain/ingredient-reference';
import {
  materialPlanRowSchema, purchaseDraftRowSchema, purchaseLineRowSchema,
} from '@/domain/purchasing';
import { rowSchemas } from '@/domain/master-data';
import type { Database } from './database.types';
import { rows } from './data';
import hasPermission from './permissions';

/** RLS scopes the ledger to the signed-in organization and facility. Null means no access. */
export default async function loadIngredientStock(db: SupabaseClient<Database>) {
  if (!await hasPermission(db, 'inventory.read')) return null;
  const events = await rows(db, 'inventory_events', rowSchemas.inventory_events);
  return inventoryBalances(events);
}

/** Loads read-only, current-facility inventory reference quantities for one ingredient. */
export async function loadIngredientReferenceSummary(
  db: SupabaseClient<Database>,
  ingredientId: string,
) {
  const [inventoryAccess, planningAccess] = await Promise.all([
    hasPermission(db, 'inventory.read'),
    hasPermission(db, 'planning.read'),
  ]);
  if (!inventoryAccess || !planningAccess) return null;
  const [events, drafts, lines, receipts, plans] = await Promise.all([
    rows(db, 'inventory_events', rowSchemas.inventory_events),
    rows(db, 'purchase_drafts', purchaseDraftRowSchema),
    rows(db, 'purchase_draft_lines', purchaseLineRowSchema),
    rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
    rows(db, 'material_plans', materialPlanRowSchema),
  ]);
  return ingredientReferenceQuantities(ingredientId, events, drafts, lines, receipts, plans);
}

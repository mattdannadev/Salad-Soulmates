import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { customerOptionRowSchema, customerRowSchema } from '@/domain/customer-pricing';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import { rowSchemas } from '@/domain/master-data';
import {
  materialAvailabilitySchema,
  materialPlanRowSchema,
  purchaseDraftRowSchema,
  purchaseLineRowSchema,
} from '@/domain/purchasing';
import { mixerBatchSchema, productionLotSchema, productionPlanSchema } from '@/domain/production';
import {
  productRowSchema,
  recipeRowSchema,
  recipeVersionRowSchema,
} from '@/domain/recipes';
import type { PurchasingRepository } from '@/features/purchasing/application/purchasing-repository';
import { readResult, rows } from '@/lib/data';
import type { Database } from '@/lib/database.types';

const productionBatchSchema = mixerBatchSchema.extend({ spice_preparation_id: z.uuid() });

/** Adapt the current RLS-scoped Supabase client to the purchasing data port. */
export default function createSupabasePurchasingRepository(
  db: SupabaseClient<Database>,
): PurchasingRepository {
  return {
    async loadWorkspaceRecords() {
      const [
        plans,
        drafts,
        lines,
        ingredients,
        suppliers,
        packs,
        products,
        recipes,
        versions,
        receipts,
        orders,
        customers,
        customerOptions,
        productionPlans,
        productionLots,
      ] = await Promise.all([
        rows(db, 'material_plans', materialPlanRowSchema),
        rows(db, 'purchase_drafts', purchaseDraftRowSchema),
        rows(db, 'purchase_draft_lines', purchaseLineRowSchema),
        rows(db, 'ingredients', rowSchemas.ingredients),
        rows(db, 'suppliers', rowSchemas.suppliers),
        rows(db, 'supplier_items', rowSchemas.supplier_items),
        rows(db, 'products', productRowSchema),
        rows(db, 'recipes', recipeRowSchema),
        rows(db, 'recipe_versions', recipeVersionRowSchema),
        rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
        rows(db, 'customer_orders', customerOrderRowSchema),
        rows(db, 'customers', customerRowSchema),
        rows(db, 'customer_product_options', customerOptionRowSchema),
        rows(db, 'order_production_plans', productionPlanSchema),
        rows(db, 'production_lots', productionLotSchema),
      ]);
      return {
        productionPlans,
        productionLots,
        orders,
        customers,
        customerOptions,
        plans,
        receipts,
        drafts,
        lines,
        ingredients,
        suppliers,
        packs,
        products,
        recipes,
        versions,
      };
    },
    async loadMaterialRequirements(planId) {
      return readResult(
        await db.rpc('material_requirements', { plan_id: planId }),
        z.array(materialAvailabilitySchema),
        'material_requirements',
      );
    },
    async loadProductionBatches(orderId) {
      return readResult(
        await db.rpc('order_production_batches', { order_id: orderId }),
        z.array(productionBatchSchema),
        'order_production_batches',
      );
    },
  };
}

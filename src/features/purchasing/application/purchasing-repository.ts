import type { z } from 'zod';
import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import type { CustomerOrder } from '@/domain/customer-orders';
import type {
  Ingredient, ReceiptLine, Supplier, SupplierItem,
} from '@/domain/master-data';
import type {
  MaterialAvailability, MaterialPlan, PurchaseDraft, PurchaseLine,
} from '@/domain/purchasing';
import type {
  MixerBatch, ProductionLot, ProductionPlan,
} from '@/domain/production';
import type {
  productRowSchema, Recipe, recipeVersionRowSchema,
} from '@/domain/recipes';

export type Product = z.infer<typeof productRowSchema>;
export type RecipeVersion = z.infer<typeof recipeVersionRowSchema>;
export type PurchasingProductionBatch = MixerBatch & { spice_preparation_id: string };

/** Provider-neutral records needed to assemble the purchasing workspace. */
export interface PurchasingWorkspaceRecords {
  productionPlans: ProductionPlan[];
  productionLots: ProductionLot[];
  orders: CustomerOrder[];
  customers: Customer[];
  customerOptions: CustomerOption[];
  plans: MaterialPlan[];
  receipts: ReceiptLine[];
  drafts: PurchaseDraft[];
  lines: PurchaseLine[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  packs: SupplierItem[];
  products: Product[];
  recipes: Recipe[];
  versions: RecipeVersion[];
}

/** Data-access boundary implemented by the active persistence provider. */
export interface PurchasingRepository {
  loadWorkspaceRecords(this: void): Promise<PurchasingWorkspaceRecords>;
  loadMaterialRequirements(this: void, planId: string): Promise<MaterialAvailability[]>;
  loadProductionBatches(this: void, orderId: string): Promise<PurchasingProductionBatch[]>;
}

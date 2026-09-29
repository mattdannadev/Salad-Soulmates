import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { countSetupRows } from '@/lib/setup-data';

export type SetupStepId = 'ingredients' | 'suppliers' | 'products' | 'pricing' | 'orders';
export type SetupStepState = 'ready' | 'missing' | 'denied' | 'error';
export interface SetupStep {
  id: SetupStepId;
  state: SetupStepState;
  counts?: readonly number[];
  canAct?: boolean;
}

export interface SetupAccess {
  master: boolean;
  masterWrite: boolean;
  products: boolean;
  productsWrite: boolean;
  orderWorkspace: boolean;
  ordersWrite: boolean;
}

const denied = (id: SetupStepId): SetupStep => ({ id, state: 'denied' });
const failed = (id: SetupStepId): SetupStep => ({ id, state: 'error' });
type DatabaseClient = SupabaseClient<Database>;
type CountRequests = Promise<number>[];
type SetupResult = Promise<SetupStep[]>;
type StepResult = Promise<SetupStep>;
type Id = SetupStepId;

/** Reads each setup milestone independently so one failed count cannot masquerade as empty data. */
export default async function loadSetupSteps(db: DatabaseClient, access: SetupAccess): SetupResult {
  async function read(id: Id, allowed: boolean, canAct: boolean, reads: CountRequests): StepResult {
    if (!allowed) return denied(id);
    try {
      const counts = await Promise.all(reads);
      return {
        id, state: counts.every((count) => count > 0) ? 'ready' : 'missing', counts, canAct,
      };
    } catch {
      return failed(id);
    }
  }

  return Promise.all([
    read('ingredients', access.master, access.masterWrite, access.master
      ? [countSetupRows(db, 'ingredients', { column: 'active', value: true })] : []),
    read('suppliers', access.master, access.masterWrite, access.master
      ? [
        countSetupRows(db, 'suppliers', { column: 'active', value: true }),
        countSetupRows(db, 'supplier_items', { column: 'active', value: true }),
      ] : []),
    read('products', access.products, access.productsWrite, access.products
      ? [
        countSetupRows(db, 'products', { column: 'active', value: true }),
        countSetupRows(db, 'recipe_versions', { column: 'status', value: 'Released' }),
      ] : []),
    read('pricing', access.products, access.productsWrite, access.products
      ? [countSetupRows(db, 'customer_product_options', { column: 'active', value: true })] : []),
    read('orders', access.orderWorkspace, access.ordersWrite, access.orderWorkspace
      ? [countSetupRows(db, 'customer_orders')] : []),
  ]);
}

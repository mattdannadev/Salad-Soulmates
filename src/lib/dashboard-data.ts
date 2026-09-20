import 'server-only';
import { z } from 'zod';
import { demandCoverageSchema } from '@/domain/demand-coverage';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import {
  materialPlanRowSchema,
  purchaseDraftRowSchema,
  purchaseLineRowSchema,
} from '@/domain/purchasing';
import { productionPlanSchema } from '@/domain/production';
import { rowSchemas } from '@/domain/master-data';
import { purchaseProgress } from '@/domain/supplier-orders';
import inventoryBalances from '@/domain/inventory';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';
import { rows, readResult } from './data';

/** Each operational panel checks all permissions needed to interpret its records. */
export default async function loadDashboard() {
  const { db, profile } = await requireAdminShell();
  const permissions = ['orders.read', 'planning.read', 'inventory.read', 'master_data.read', 'products.read', 'planning.write'];
  const allowed = await Promise.all(permissions.map((permission) => hasPermission(db, permission)));
  const [
    orderAccess, planningAccess, inventoryAccess, masterAccess, productAccess, purchasingWrite,
  ] = allowed;
  const canOrders = orderAccess && planningAccess;
  const canPurchases = orderAccess && planningAccess && inventoryAccess && masterAccess;
  const canStock = inventoryAccess && masterAccess;
  const canCoverage = canPurchases && productAccess;
  const [
    orders, plans, purchases, lines, receipts, suppliers, ingredients, events, production,
  ] = await Promise.all([
    canOrders ? rows(db, 'customer_orders', customerOrderRowSchema) : [],
    canOrders ? rows(db, 'material_plans', materialPlanRowSchema) : [],
    canPurchases ? rows(db, 'purchase_drafts', purchaseDraftRowSchema) : [],
    canPurchases ? rows(db, 'purchase_draft_lines', purchaseLineRowSchema) : [],
    canPurchases ? rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines) : [],
    canPurchases ? rows(db, 'suppliers', rowSchemas.suppliers) : [],
    canStock ? rows(db, 'ingredients', rowSchemas.ingredients) : [],
    canStock ? rows(db, 'inventory_events', rowSchemas.inventory_events) : [],
    canOrders ? rows(db, 'order_production_plans', productionPlanSchema) : [],
  ]);
  const activePlans = plans.filter((plan) => plan.status === 'Active');
  const openOrders = orders
    .filter((order) => activePlans.some((plan) => plan.id === order.id))
    .toSorted((a, b) => a.needed_on.localeCompare(b.needed_on));
  const incoming = purchases
    .filter((purchase) => purchase.status === 'Confirmed')
    .map((purchase) => ({ ...purchase, progress: purchaseProgress(purchase, lines, receipts) }))
    .filter((purchase) => purchase.progress.open)
    .toSorted((a, b) => a.expected_on.localeCompare(b.expected_on));
  const coverage = canCoverage ? readResult(
    await db.rpc('demand_coverage'),
    z.array(demandCoverageSchema),
    'dashboard_demand_coverage',
  ) : [];
  const balances = inventoryBalances(events);
  const demand = new Map<string, number>();
  activePlans.forEach((plan) => plan.requirements.forEach((item) => {
    demand.set(item.ingredient_id, (demand.get(item.ingredient_id) ?? 0) + item.required);
  }));
  const stock = ingredients
    .filter((ingredient) => ingredient.active)
    .map((ingredient) => ({
      ...ingredient,
      balance: balances[ingredient.id] ?? null,
      demand: demand.get(ingredient.id) ?? 0,
    }))
    .toSorted(
      (a, b) => Number(b.demand > 0) - Number(a.demand > 0)
        || Number(b.balance !== null && b.balance <= 0)
          - Number(a.balance !== null && a.balance <= 0)
        || a.name.localeCompare(b.name),
    );
  return {
    profile,
    canOrders,
    canPurchases,
    canStock,
    canCoverage,
    canGeneratePurchases: Boolean(canCoverage && purchasingWrite),
    coverage,
    openOrders,
    incoming,
    suppliers,
    stock,
    production,
  };
}

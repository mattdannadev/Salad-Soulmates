import 'server-only';
import { redirect } from 'next/navigation';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import { rowSchemas } from '@/domain/master-data';
import { materialPlanRowSchema, purchaseDraftRowSchema, purchaseLineRowSchema } from '@/domain/purchasing';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';
import { rows } from './data';

/** Keep the supplier directory available without exposing purchases to catalog-only viewers. */
export default async function loadSupplierWorkspace() {
  const { db, profile } = await requireAdminShell();
  if (!await hasPermission(db, 'master_data.read')) redirect('/app');
  const [suppliers, access, write, products, edit] = await Promise.all([
    rows(db, 'suppliers', rowSchemas.suppliers),
    Promise.all(['orders.read', 'planning.read', 'inventory.read'].map((permission) => hasPermission(db, permission))),
    hasPermission(db, 'planning.write'),
    hasPermission(db, 'products.read'),
    hasPermission(db, 'master_data.write'),
  ]);
  const canReadPurchases = access.every(Boolean);
  const [orders, plans, drafts, lines, receipts, packs] = canReadPurchases ? await Promise.all([
    rows(db, 'customer_orders', customerOrderRowSchema),
    rows(db, 'material_plans', materialPlanRowSchema),
    rows(db, 'purchase_drafts', purchaseDraftRowSchema),
    rows(db, 'purchase_draft_lines', purchaseLineRowSchema),
    rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
    rows(db, 'supplier_items', rowSchemas.supplier_items),
  ]) : [[], [], [], [], [], []];
  return {
    suppliers: suppliers.sort((a, b) => a.name.localeCompare(b.name)),
    orders,
    plans,
    drafts,
    lines,
    receipts,
    packs,
    canReadPurchases,
    canWrite: canReadPurchases && write && products,
    canEdit: profile.role === 'admin' && edit,
    locale: profile.preferred_locale,
  };
}

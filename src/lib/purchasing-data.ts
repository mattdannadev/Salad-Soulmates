import 'server-only';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  materialPlanRowSchema,
  materialAvailabilitySchema,
  purchaseDraftRowSchema,
  purchaseLineRowSchema,
} from '@/domain/purchasing';
import { rowSchemas } from '@/domain/master-data';
import {
  productRowSchema,
  recipeRowSchema,
  recipeVersionRowSchema,
} from '@/domain/recipes';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';
import { rows, readResult } from './data';

/** Require each underlying read permission so missing supply is never silently treated as zero. */
export default async function loadPurchasingWorkspace(selectedId?: string) {
  const { db, profile } = await requireAdminShell();
  const required = [
    'planning.read',
    'inventory.read',
    'products.read',
    'master_data.read',
  ];
  const allowed = await Promise.all(
    required.map((permission) => hasPermission(db, permission)),
  );
  if (allowed.some((permission) => !permission)) redirect('/app');
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
    canWrite,
    receipts,
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
    hasPermission(db, 'planning.write'),
    rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
  ]);
  const selected = selectedId ? plans.find((plan) => plan.id === selectedId) : undefined;
  const requirements = selected?.status === 'Active'
    ? readResult(
      await db.rpc('material_requirements', { plan_id: selected.id }),
      z.array(materialAvailabilitySchema),
      'material_requirements',
    )
    : [];
  return {
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
    canWrite,
    selected,
    requirements,
    locale: profile.preferred_locale,
  };
}

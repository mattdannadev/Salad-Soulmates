import 'server-only';
import { requireAdminShell, requireProfile } from '@/lib/auth';
import { facilityDate } from '@/domain/format';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';
import type { ActionResult } from '@/domain/master-data';
import {
  buildSupplierPricingItems,
  supplierPriceInputSchema,
  type SupplierPriceInput,
} from './domain';
import {
  findSupplierItem,
  insertSupplierPrice,
  loadSupplierPricingData,
  SupplierPricingDataError,
} from './data';

export async function loadSupplierPricingWorkspace() {
  const { db, profile } = await requireAdminShell();
  const currentDate = facilityDate();
  const [canRead, canWrite] = await Promise.all([
    hasPermission(db, 'master_data.read'),
    hasPermission(db, 'master_data.write'),
  ]);
  if (!canRead) {
    return {
      items: [],
      suppliers: [],
      canRead: false,
      canWrite: false,
      currentDate,
      locale: profile.preferred_locale,
    };
  }
  const source = await loadSupplierPricingData(db);
  const items = buildSupplierPricingItems(source, currentDate);
  return {
    items,
    suppliers: source.suppliers
      .filter((supplier) => source.items.some((item) => item.supplier_id === supplier.id))
      .map((supplier) => ({ id: supplier.id, name: supplier.name }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    canRead: true,
    canWrite,
    currentDate,
    locale: profile.preferred_locale,
  };
}

/** Appends a price fact; existing rows remain immutable by design and by database policy. */
export async function appendSupplierPrice(input: SupplierPriceInput): Promise<ActionResult> {
  const validated = supplierPriceInputSchema.safeParse(input);
  if (!validated.success) {
    return {
      ok: false,
      message: validated.error.issues[0]?.message ?? 'Check the price details.',
    };
  }
  const { db } = await requireProfile({ readOnly: false });
  const permissions = await Promise.all([
    hasPermission(db, 'master_data.read'),
    hasPermission(db, 'master_data.write'),
  ]);
  if (permissions.some((allowed) => !allowed)) {
    return { ok: false, message: 'Permission required to add supplier pricing.' };
  }

  try {
    const item = await findSupplierItem(db, validated.data.supplier_item_id);
    if (!item) return { ok: false, message: 'Supplier item was not found. Refresh and try again.' };
    if (!item.active || !item.ingredients.active || !item.suppliers.active) {
      return {
        ok: false,
        message: 'Reactivate the supplier item, ingredient, and supplier before adding a price.',
      };
    }
    const id = await insertSupplierPrice(db, validated.data);
    return { ok: true, id, message: 'Supplier price added. Previous prices remain in history.' };
  } catch (error) {
    logFailure('supplier_price_append', error);
    if (error instanceof SupplierPricingDataError && error.code === '23505') {
      return {
        ok: false,
        message: 'A price already exists for this item on that effective date. Choose another date.',
      };
    }
    return {
      ok: false,
      message: 'Could not add the supplier price. Your entries are preserved; retry shortly.',
    };
  }
}

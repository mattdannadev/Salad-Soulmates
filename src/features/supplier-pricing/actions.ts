'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/domain/master-data';
import { supplierPriceInputSchema } from './domain';
import { appendSupplierPrice } from './service';

export interface SupplierPriceActionState extends ActionResult {
  submittedItemId?: string;
}

export const initialSupplierPriceActionState: SupplierPriceActionState = {
  ok: false,
  message: '',
};

export async function addSupplierPrice(
  _previousState: SupplierPriceActionState,
  formData: FormData,
): Promise<SupplierPriceActionState> {
  const submittedItemId = formData.get('supplier_item_id');
  const validated = supplierPriceInputSchema.safeParse({
    supplier_item_id: submittedItemId,
    unit_price: formData.get('unit_price'),
    effective_on: formData.get('effective_on'),
    note: formData.get('note') ?? '',
  });
  if (!validated.success) {
    return {
      ok: false,
      submittedItemId: typeof submittedItemId === 'string' ? submittedItemId : undefined,
      message: validated.error.issues[0]?.message ?? 'Check the price details.',
    };
  }
  const result = await appendSupplierPrice(validated.data);
  if (result.ok) {
    ['/app/pricing', '/app/suppliers', '/app/ingredients', '/app/purchasing']
      .forEach((path) => revalidatePath(path));
  }
  return { ...result, submittedItemId: validated.data.supplier_item_id };
}

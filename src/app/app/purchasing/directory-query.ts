import { z } from 'zod';
import type { PurchaseDraft, PurchaseLine } from '@/domain/purchasing';
import { purchaseProgress, type PurchaseReceipt } from '@/domain/supplier-orders';

export type PurchasingSearchParams = Record<string, string | string[] | undefined>;
export const PURCHASING_PAGE_SIZE = 20;

export const purchasingDirectorySorts = [
  { value: 'recent', label: 'Recently saved' },
  { value: 'due-soon', label: 'Earliest due date' },
  { value: 'due-late', label: 'Latest due date' },
] as const;

function singleValue(query: PurchasingSearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/** URL criteria for saved purchases; contextual deep-link keys remain independent. */
export function parsePurchasingDirectoryQuery(
  query: PurchasingSearchParams,
  supplierIds: readonly string[],
  orderIds: readonly string[],
  ingredientIds: readonly string[],
  dueDates: readonly string[],
) {
  const supplierFilter = z.uuid().optional().catch(undefined).parse(singleValue(query, 'supplierFilter'));
  const orderFilter = z.uuid().optional().catch(undefined).parse(singleValue(query, 'orderFilter'));
  const ingredientFilter = z.uuid().optional().catch(undefined).parse(singleValue(query, 'ingredientFilter'));
  const due = z.iso.date().optional().catch(undefined).parse(singleValue(query, 'due'));
  const rawPage = singleValue(query, 'page');
  return {
    q: z.string().trim().max(200).catch('')
      .parse(singleValue(query, 'q')),
    supplierFilter: supplierFilter && supplierIds.includes(supplierFilter)
      ? supplierFilter : undefined,
    orderFilter: orderFilter && orderIds.includes(orderFilter) ? orderFilter : undefined,
    ingredientFilter: ingredientFilter && ingredientIds.includes(ingredientFilter)
      ? ingredientFilter : undefined,
    due: due && dueDates.includes(due) ? due : undefined,
    status: z.enum(['Draft', 'Confirmed', 'Cancelled']).optional().catch(undefined)
      .parse(singleValue(query, 'status')),
    delivery: z.enum(['unreceived']).optional().catch(undefined)
      .parse(singleValue(query, 'delivery')),
    sort: z.enum(['recent', 'due-soon', 'due-late']).catch('recent')
      .parse(singleValue(query, 'sort')),
    page: rawPage && /^[1-9]\d*$/.test(rawPage)
      ? z.coerce.number().int().min(1).max(1_000_000)
        .catch(1)
        .parse(rawPage) : 1,
  };
}

export type PurchasingDirectoryQuery = ReturnType<typeof parsePurchasingDirectoryQuery>;

export function selectPurchaseDrafts(
  drafts: readonly PurchaseDraft[],
  lines: readonly PurchaseLine[],
  receipts: readonly PurchaseReceipt[],
  query: PurchasingDirectoryQuery,
  supplierNames: ReadonlyMap<string, string>,
  orderNames: ReadonlyMap<string, string>,
  ingredientNames: ReadonlyMap<string, string>,
  locale: 'en' | 'es',
): PurchaseDraft[] {
  const search = query.q.toLocaleLowerCase(locale);
  const linesByDraft = new Map<string, PurchaseLine[]>();
  lines.forEach((line) => {
    const matching = linesByDraft.get(line.purchase_draft_id) ?? [];
    matching.push(line);
    linesByDraft.set(line.purchase_draft_id, matching);
  });
  const progressLines = [...lines];
  const progressReceipts = [...receipts];
  return drafts
    .filter((draft) => query.delivery !== 'unreceived'
      || (draft.status === 'Confirmed'
        && purchaseProgress(draft, progressLines, progressReceipts).open))
    .filter((draft) => !query.supplierFilter || draft.supplier_id === query.supplierFilter)
    .filter((draft) => !query.orderFilter || draft.material_plan_id === query.orderFilter)
    .filter((draft) => !query.ingredientFilter || linesByDraft.get(draft.id)
      ?.some((line) => line.ingredient_id === query.ingredientFilter))
    .filter((draft) => !query.due || draft.expected_on === query.due)
    .filter((draft) => !query.status || draft.status === query.status)
    .filter((draft) => !search || [
      draft.reference, draft.expected_on, draft.status,
      supplierNames.get(draft.supplier_id) ?? '',
      orderNames.get(draft.material_plan_id ?? '') ?? '',
      ...(linesByDraft.get(draft.id) ?? []).map((line) => ingredientNames.get(line.ingredient_id) ?? ''),
    ].some((value) => value.toLocaleLowerCase(locale).includes(search)))
    .toSorted((left, right) => {
      if (query.sort === 'due-soon' || query.sort === 'due-late') {
        const dueOrder = left.expected_on.localeCompare(right.expected_on);
        return (query.sort === 'due-soon' ? dueOrder : -dueOrder)
          || left.id.localeCompare(right.id);
      }
      return right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id);
    });
}

import { z } from 'zod';
import { MAX_BATCH_COUNT } from '@/domain/purchasing';

const STORAGE_PREFIX = 'salad-soulmates:order-draft:';
const MAX_STORED_DRAFT_LENGTH = 16_384;
const draftSchema = z.object({
  customerId: z.union([z.uuid(), z.literal('')]),
  reference: z.string().max(120),
  neededOn: z.union([z.iso.date(), z.literal('')]),
  products: z.array(z.object({
    id: z.uuid(),
    batches: z.number().int().min(0).max(MAX_BATCH_COUNT),
    optionId: z.union([z.uuid(), z.literal('')]),
  })).max(1000),
});

export type OrderDraft = z.infer<typeof draftSchema>;

function storageKey(draftId: string): string | null {
  return z.uuid().safeParse(draftId).success ? `${STORAGE_PREFIX}${draftId}` : null;
}

/** Keep only order-entry fields, never customer contact details or arbitrary form data. */
export function orderDraftFromForm(
  form: FormData,
  customerId: string,
  choices: { id: string }[],
): OrderDraft | null {
  const products = (customerId ? choices : []).map(({ id }) => {
    const rawBatches = form.get(id);
    const rawOption = form.get(`${id}-packaging`);
    return {
      id,
      batches: typeof rawBatches === 'string' && /^\d+$/u.test(rawBatches)
        ? Number(rawBatches) : Number.NaN,
      optionId: typeof rawOption === 'string' ? rawOption : '',
    };
  });
  const draft = draftSchema.safeParse({
    customerId,
    reference: form.get('reference'),
    neededOn: form.get('needed_on'),
    products,
  });
  return draft.success ? draft.data : null;
}

/** A tab-local snapshot survives the customer page detour without putting entries in a URL. */
export function saveOrderDraft(draftId: string, draft: OrderDraft): boolean {
  const key = storageKey(draftId);
  const validated = draftSchema.safeParse(draft);
  if (!key || !validated.success) return false;
  const serialized = JSON.stringify(validated.data);
  if (serialized.length > MAX_STORED_DRAFT_LENGTH) return false;
  try {
    sessionStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    if (error instanceof DOMException) return false;
    throw error;
  }
}

/** Return an immutable snapshot for React's external-store hydration contract. */
export function orderDraftSnapshot(draftId: string): string {
  const key = storageKey(draftId);
  if (!key) return '';
  try {
    const serialized = sessionStorage.getItem(key) ?? '';
    return serialized.length <= MAX_STORED_DRAFT_LENGTH ? serialized : '';
  } catch (error) {
    if (error instanceof DOMException) return '';
    throw error;
  }
}

export function parseOrderDraftSnapshot(serialized: string): OrderDraft | null {
  if (!serialized || serialized.length > MAX_STORED_DRAFT_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    const draft = draftSchema.safeParse(parsed);
    return draft.success ? draft.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function clearOrderDraft(draftId: string): void {
  const key = storageKey(draftId);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
}

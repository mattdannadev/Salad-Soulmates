import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readResult } from '@/lib/data';
import type { Database } from '@/lib/database.types';
import { operationError } from '@/lib/operation-error';

const recipeRows = z.array(z.object({
  id: z.uuid(), name: z.string().max(120), active_version_id: z.uuid().nullable(),
})).max(25);
const orderRows = z.array(z.object({
  id: z.uuid(),
  customer_name: z.string().max(120),
  reference: z.string().max(120),
  needed_on: z.iso.date(),
})).max(25);

export type RecipeResult = z.infer<typeof recipeRows>[number] & { url: string };
export type OrderResult = z.infer<typeof orderRows>[number] & { url: string };

/** These are the only data reads exposed to the first Copilot release. */
export async function readCopilotRecipes(
  db: SupabaseClient<Database>,
  organizationId: string,
  search: string | undefined,
  limit: number,
  signal: AbortSignal,
): Promise<RecipeResult[]> {
  let query = db.from('recipes').select('id,name,active_version_id')
    .eq('organization_id', organizationId).order('name')
    .limit(limit);
  if (search) query = query.ilike('name', `%${search}%`);
  const rows = readResult(await query.abortSignal(signal), recipeRows, 'operations_recipes');
  return rows.map((recipe) => ({ ...recipe, url: `/app/recipes/${recipe.id}` }));
}

export async function readCopilotOrders(
  db: SupabaseClient<Database>,
  organizationId: string,
  facilityId: string,
  search: string | undefined,
  limit: number,
  signal: AbortSignal,
): Promise<OrderResult[]> {
  let query = db.from('customer_orders').select('id,customer_name,reference,needed_on')
    .eq('organization_id', organizationId).eq('facility_id', facilityId)
    .order('needed_on', { ascending: false })
    .limit(limit);
  if (search) query = query.ilike('customer_name', `%${search}%`);
  const rows = readResult(await query.abortSignal(signal), orderRows, 'operations_orders');
  return rows.map((order) => ({ ...order, url: `/app/orders?order=${order.id}` }));
}

export async function beginCopilotRequest(
  db: SupabaseClient<Database>,
  intent: 'recipes' | 'orders',
  correlationId: string,
  signal: AbortSignal,
): Promise<'accepted' | 'denied' | 'rate_limited'> {
  const result = await db.rpc('begin_operations_copilot_request', {
    requested_intent: intent,
    request_correlation_id: correlationId,
  }).abortSignal(signal);
  if (result.error) throw operationError('operations_copilot_begin', 'Unable to check Copilot access.', result.error);
  return z.enum(['accepted', 'denied', 'rate_limited']).parse(result.data);
}

export async function finishCopilotRequest(
  db: SupabaseClient<Database>,
  correlationId: string,
  outcome: 'completed' | 'failed',
  signal: AbortSignal,
): Promise<void> {
  const result = await db.rpc('finish_operations_copilot_request', {
    request_correlation_id: correlationId,
    request_outcome: outcome,
  }).abortSignal(signal);
  if (result.error) throw operationError('operations_copilot_finish', 'Unable to record Copilot activity.', result.error);
}

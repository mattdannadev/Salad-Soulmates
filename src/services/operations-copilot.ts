import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { resolveApiAdminShell } from '@/lib/auth';
import {
  beginCopilotRequest, finishCopilotRequest, readCopilotOrders, readCopilotRecipes,
} from '@/data/operations-copilot';

const MAX_RESPONSE_BYTES = 32_768;
const COMPLETION_TIMEOUT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;

const requestSchema = z.object({
  kind: z.enum(['recipes', 'orders']),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(25)
    .default(10),
}).strict();
const recipeResultSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string().max(120),
  active_version_id: z.uuid().nullable(),
  url: z.string().startsWith('/app/recipes/'),
})).max(25);
const orderResultSchema = z.array(z.object({
  id: z.uuid(),
  customer_name: z.string().max(120),
  reference: z.string().max(120),
  needed_on: z.iso.date(),
  url: z.string().startsWith('/app/orders?order='),
})).max(25);

type Intent = z.infer<typeof requestSchema>['kind'];

/** Static read-only registry: user input never chooses SQL, scope, or a tool. */
const tools = {
  recipes: {
    permission: 'products.read',
    scope: 'organization',
    maxRows: 25,
    source: '/app/recipes',
    inputSchema: requestSchema,
    outputSchema: recipeResultSchema,
    execute: readCopilotRecipes,
  },
  orders: {
    permission: 'orders.read',
    scope: 'facility',
    maxRows: 25,
    source: '/app/orders',
    inputSchema: requestSchema,
    outputSchema: orderResultSchema,
    execute: readCopilotOrders,
  },
} as const;

function invalidRequest(input: unknown) {
  const kind = input && typeof input === 'object' && 'kind' in input
    && typeof input.kind === 'string' ? input.kind : undefined;
  return {
    ok: false as const,
    code: kind && !(kind in tools) ? 'unsupported' as const : 'invalid' as const,
    error: 'Choose recipes or orders with an optional search and limit.',
  };
}

/** Authorizes, meters, reads, and audits one bounded administrator request. */
export default async function queryOperations(input: unknown, signal?: AbortSignal) {
  const readSignal = signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(input);
  const access = await resolveApiAdminShell(readSignal);
  if (!access.ok) {
    let code: 'unauthenticated' | 'denied' | 'unavailable' = 'unavailable';
    if (access.status === 401) code = 'unauthenticated';
    if (access.status === 403) code = 'denied';
    return { ok: false as const, code, error: access.error };
  }
  const { db, profile } = access;
  const { kind, search, limit } = parsed.data;
  const descriptor = tools[kind];
  const correlationId = randomUUID();
  const begin = await beginCopilotRequest(db, kind, correlationId, readSignal);
  if (begin === 'rate_limited') {
    return {
      ok: false as const,
      code: 'rate_limited' as const,
      error: 'Operations Copilot has reached its hourly request limit. Try again later.',
    };
  }
  if (begin === 'denied' || profile.role !== 'admin') {
    return {
      ok: false as const,
      code: 'denied' as const,
      error: 'Operations Copilot is unavailable for this access profile.',
    };
  }

  try {
    // The database RPC rechecks entitlement and named permission. The scoped
    // read still runs under the user's RLS-governed session.
    let records;
    const organizationId = profile.organization_id;
    const facilityId = profile.facility_id;
    if (kind === 'recipes') {
      records = await tools.recipes.execute(db, organizationId, search, limit, readSignal);
    } else {
      const readOrders = tools.orders.execute;
      records = await readOrders(db, organizationId, facilityId, search, limit, readSignal);
    }
    if (readSignal.aborted || records.length > descriptor.maxRows) {
      throw new Error('Operations Copilot read exceeded its limits.');
    }
    descriptor.outputSchema.parse(records);
    const result = {
      ok: true as const, kind, records, source: descriptor.source, count: records.length,
    };
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error('Operations Copilot response exceeded its byte limit.');
    }
    await finishCopilotRequest(db, correlationId, 'completed', readSignal);
    return result;
  } catch (error) {
    // A timed-out read has already aborted its HTTP query; use a fresh, short
    // signal to record the failure before returning a safe service error.
    await finishCopilotRequest(db, correlationId, 'failed', AbortSignal.timeout(COMPLETION_TIMEOUT_MS));
    throw error;
  }
}

export type OperationsCopilotIntent = Intent;

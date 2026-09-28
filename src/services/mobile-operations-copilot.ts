import 'server-only';

import { isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  fetchMobileReceivingOrders,
  fetchMobileWorkerPreparations,
} from '@/data/mobile-operations-copilot';
import { profileRowSchema, type Profile } from '@/domain/master-data';
import { workerPreparationsSchema, type WorkerPreparation } from '@/domain/worker-preparations';
import { readResult } from '@/lib/data';
import type { Database } from '@/lib/database.types';
import { operationError } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';
import { isConfigured, supabase } from '@/lib/supabase';
import isOperationsCopilotEnabled from '@/services/operations-copilot-entitlement';
import type { PurchaseReceivingOrder } from '@/domain/purchase-receiving';

const requestSchema = z.object({
  kind: z.enum(['preparations', 'deliveries']),
  limit: z.number().int().min(1).max(20)
    .default(10),
}).strict();

type MobileRole = Extract<Profile['role'], 'worker' | 'receiver'>;
type MobileDb = SupabaseClient<Database>;

type MobileAccess = {
  ok: true;
  db: MobileDb;
  profile: Profile & { role: MobileRole };
} | {
  ok: false;
  code: 'unauthenticated' | 'denied' | 'unavailable';
  error: string;
};

export interface MobileOperationsCopilotDependencies {
  resolveAccess(): Promise<MobileAccess>;
  isEnabled(): Promise<boolean>;
  hasPermission(db: MobileDb, permission: string): Promise<boolean>;
  loadPreparations(db: MobileDb): Promise<WorkerPreparation[]>;
  loadDeliveries(db: MobileDb): Promise<PurchaseReceivingOrder[]>;
}

async function resolveMobileAccess(): Promise<MobileAccess> {
  if (!isConfigured()) {
    return {
      ok: false,
      code: 'unavailable',
      error: 'Mobile Copilot is temporarily unavailable.',
    };
  }
  const db = await supabase({ readOnly: true });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError && !isAuthSessionMissingError(authError)) {
    throw operationError(
      'mobile_copilot_auth',
      'Unable to verify the session. Try again.',
      authError,
    );
  }
  if (!user) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in to use Mobile Copilot.' };
  }
  const profileResult = await db.from('profiles').select('*')
    .eq('id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (profileResult.error) {
    throw operationError(
      'mobile_copilot_profile',
      'Unable to load your access profile.',
      profileResult.error,
    );
  }
  const parsed = profileRowSchema.safeParse(profileResult.data);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'denied',
      error: 'An active worker or receiver profile is required.',
    };
  }
  const profile = parsed.data;
  if (profile.role !== 'worker' && profile.role !== 'receiver') {
    return {
      ok: false,
      code: 'denied',
      error: 'An active worker or receiver profile is required.',
    };
  }
  return {
    ok: true,
    db,
    profile: profile.role === 'worker'
      ? { ...profile, role: 'worker' }
      : { ...profile, role: 'receiver' },
  };
}

const defaultDependencies: MobileOperationsCopilotDependencies = {
  resolveAccess: resolveMobileAccess,
  isEnabled: isOperationsCopilotEnabled,
  hasPermission,
  async loadPreparations(db) {
    return readResult(
      await fetchMobileWorkerPreparations(db),
      workerPreparationsSchema,
      'mobile_copilot_worker_preparations',
    );
  },
  loadDeliveries: fetchMobileReceivingOrders,
};

/** Fixed, read-only mobile intents. The caller never supplies SQL, filters, or identifiers. */
export default async function queryMobileOperations(
  input: unknown,
  dependencies: MobileOperationsCopilotDependencies = defaultDependencies,
) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      code: 'invalid' as const,
      error: 'Choose preparations or deliveries and a result limit from 1 to 20.',
    };
  }
  const access = await dependencies.resolveAccess();
  if (!access.ok) return access;
  if (!await dependencies.isEnabled()) {
    return {
      ok: false as const,
      code: 'denied' as const,
      error: 'Mobile Copilot is not enabled for your access profile.',
    };
  }

  const { kind, limit } = parsed.data;
  const expectedKind = access.profile.role === 'worker' ? 'preparations' : 'deliveries';
  if (kind !== expectedKind) {
    return {
      ok: false as const,
      code: 'denied' as const,
      error: 'This Copilot check is not available for your role.',
    };
  }
  const permission = access.profile.role === 'worker' ? 'production.mobile' : 'inventory.receive';
  if (!await dependencies.hasPermission(access.db, permission)) {
    return {
      ok: false as const,
      code: 'denied' as const,
      error: 'Your access profile does not include this workspace permission.',
    };
  }

  if (access.profile.role === 'worker') {
    const preparations = (await dependencies.loadPreparations(access.db))
      .filter((item) => item.status !== 'Complete')
      .toSorted((left, right) => (left.assigned_on ?? left.plan_start_on).localeCompare(right.assigned_on ?? right.plan_start_on)
        || left.sequence - right.sequence)
      .slice(0, limit)
      .map((item) => ({
        id: item.planned_mixer_batch_id,
        assignedOn: item.assigned_on,
        productName: item.product_name,
        productionLotCode: item.production_lot_code ?? 'Assigned when production starts',
        status: item.status,
        completedIngredients: item.lines.filter((line) => line.id
          && line.usages.reduce((sum, usage) => sum + usage.quantity, 0)
            >= line.required_quantity).length,
        totalIngredients: item.lines.length,
        url: '/worker',
      }));
    return {
      ok: true as const,
      kind: 'preparations' as const,
      role: access.profile.role,
      locale: access.profile.preferred_locale,
      records: preparations,
      count: preparations.length,
    };
  }

  const deliveries = (await dependencies.loadDeliveries(access.db))
    .slice(0, limit)
    .map((order) => ({
      id: order.id,
      supplierName: order.supplierName,
      reference: order.reference,
      expectedOn: order.expectedOn,
      lines: order.lines.filter((line) => line.outstanding > 0).map((line) => ({
        id: line.id,
        ingredientName: line.ingredientName,
        outstanding: line.outstanding,
        uom: line.uom,
      })),
      url: '/receiving',
    }));
  return {
    ok: true as const,
    kind: 'deliveries' as const,
    role: access.profile.role,
    locale: access.profile.preferred_locale,
    records: deliveries,
    count: deliveries.length,
  };
}

export type MobileOperationsCopilotResult = Awaited<ReturnType<typeof queryMobileOperations>>;

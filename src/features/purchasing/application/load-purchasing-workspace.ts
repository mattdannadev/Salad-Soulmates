import { z } from 'zod';
import type { Profile } from '@/domain/master-data';
import type { PurchasingRepository } from './purchasing-repository';

export interface PurchasingWorkspaceAccess {
  canWrite: boolean;
  canOrder: boolean;
  locale: Profile['preferred_locale'];
}

interface LoadPurchasingWorkspaceOptions extends PurchasingWorkspaceAccess {
  selectedId?: string;
}

/** Assemble purchasing state without depending on Next.js or a persistence provider. */
export async function loadPurchasingWorkspace(
  repository: PurchasingRepository,
  options: LoadPurchasingWorkspaceOptions,
) {
  const selectedId = z.uuid().optional().parse(options.selectedId);
  const records = await repository.loadWorkspaceRecords();
  const selected = selectedId
    ? records.plans.find((plan) => plan.id === selectedId)
    : undefined;
  const production = records.productionPlans.find((plan) => plan.id === selectedId);
  const [requirements, productionBatches] = await Promise.all([
    selected?.status === 'Active'
      ? repository.loadMaterialRequirements(selected.id)
      : Promise.resolve([]),
    production
      ? repository.loadProductionBatches(production.id)
      : Promise.resolve([]),
  ]);

  return {
    ...records,
    production,
    productionBatches,
    canOrder: options.canWrite && options.canOrder,
    canWrite: options.canWrite,
    selected,
    requirements,
    locale: options.locale,
  };
}

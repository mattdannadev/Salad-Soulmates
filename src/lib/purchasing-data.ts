import 'server-only';
import { redirect } from 'next/navigation';
import { loadPurchasingWorkspace as loadPurchasingWorkspaceUseCase } from '@/features/purchasing/application/load-purchasing-workspace';
import createSupabasePurchasingRepository from '@/features/purchasing/infrastructure/supabase-purchasing-repository';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';

/** Require each underlying read permission so missing supply is never silently treated as zero. */
export default async function loadPurchasingWorkspace(selectedId?: string) {
  const { db, profile } = await requireAdminShell();
  const required = [
    'orders.read',
    'planning.read',
    'inventory.read',
    'products.read',
    'master_data.read',
  ];
  const allowed = await Promise.all(
    required.map((permission) => hasPermission(db, permission)),
  );
  if (allowed.some((permission) => !permission)) redirect('/app');
  const [canWrite, canOrder] = await Promise.all([
    hasPermission(db, 'planning.write'),
    hasPermission(db, 'orders.write'),
  ]);
  return loadPurchasingWorkspaceUseCase(createSupabasePurchasingRepository(db), {
    canWrite,
    canOrder,
    locale: profile.preferred_locale,
    selectedId,
  });
}

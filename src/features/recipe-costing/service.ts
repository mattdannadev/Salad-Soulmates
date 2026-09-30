import 'server-only';
import { facilityDate } from '@/domain/format';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { buildRecipeCostingCatalog } from './domain';
import loadRecipeCostingData from './data';

/** Authorizes and prepares the read-only recipe-cost and product-margin workspace. */
export default async function loadRecipeCostingWorkspace() {
  const { db, profile } = await requireAdminShell();
  const [canReadProducts, canReadMasterData] = await Promise.all([
    hasPermission(db, 'products.read'),
    hasPermission(db, 'master_data.read'),
  ]);
  if (!canReadProducts || !canReadMasterData) {
    return {
      canRead: false,
      currentDate: facilityDate(),
      locale: profile.preferred_locale,
      products: [],
    };
  }
  const source = await loadRecipeCostingData(db);
  return {
    canRead: true,
    currentDate: facilityDate(),
    locale: profile.preferred_locale,
    products: buildRecipeCostingCatalog(source),
  };
}

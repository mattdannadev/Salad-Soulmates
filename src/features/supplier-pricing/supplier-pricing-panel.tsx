import { loadSupplierPricingWorkspace } from './service';
import SupplierPricingWorkspace from './supplier-pricing-workspace';

/**
 * Server boundary for pricing data; parent routes can compose this panel without database access.
 */
export default async function SupplierPricingPanel() {
  const workspace = await loadSupplierPricingWorkspace();
  return <SupplierPricingWorkspace {...workspace} />;
}

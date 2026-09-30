import loadRecipeCostingWorkspace from './service';
import RecipeCostingWorkspace from './recipe-costing-workspace';

/** Server boundary for the read-only costing workspace. */
export default async function RecipeCostingPanel() {
  const workspace = await loadRecipeCostingWorkspace();
  if (!workspace.canRead) return null;
  return (
    <RecipeCostingWorkspace
      products={workspace.products}
      currentDate={workspace.currentDate}
      locale={workspace.locale}
    />
  );
}

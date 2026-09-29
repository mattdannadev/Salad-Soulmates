import 'server-only';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { reportApplicationError } from '@/lib/error-reporting';
import loadSetupSteps, { type SetupStep, type SetupStepId } from './workspace-setup';

const setupIds: SetupStepId[] = ['ingredients', 'suppliers', 'products', 'pricing', 'orders'];

/** Load first-use progress with the same signed-in RLS client used by the application. */
export default async function loadWorkspaceSetup(): Promise<SetupStep[]> {
  const { db } = await requireAdminShell();
  const permissions = [
    'master_data.read', 'master_data.write', 'products.read', 'products.write',
    'orders.read', 'orders.write', 'planning.read', 'inventory.read',
  ];
  try {
    const [master, masterWrite, products, productsWrite, orders, ordersWrite,
      planning, inventory] = await Promise.all(permissions.map((code) => hasPermission(db, code)));
    return await loadSetupSteps(db, {
      master: Boolean(master),
      masterWrite: Boolean(masterWrite),
      products: Boolean(products),
      productsWrite: Boolean(productsWrite),
      orderWorkspace: Boolean(orders && planning && inventory && products && master),
      ordersWrite: Boolean(ordersWrite),
    });
  } catch (cause) {
    reportApplicationError({
      cause,
      message: 'Workspace setup permissions could not be loaded.',
      operation: 'setup_permissions',
    }).catch(() => undefined);
    return setupIds.map((id) => ({ id, state: 'error' }));
  }
}

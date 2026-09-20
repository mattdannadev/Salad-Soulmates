import 'server-only';
import { redirect } from 'next/navigation';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import { materialPlanRowSchema } from '@/domain/purchasing';
import { shippingDraftRowSchema } from '@/domain/shipping';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';
import { rows } from './data';

/** Shipping preparation reads order demand, never treats planned production as finished stock. */
export default async function loadShippingWorkspace() {
  const { db, profile } = await requireAdminShell();
  const allowed = await Promise.all(['orders.read', 'planning.read']
    .map((permission) => hasPermission(db, permission)));
  if (allowed.some((value) => !value)) redirect('/app');
  const [orders, plans, drafts, canOrder, canPlan] = await Promise.all([
    rows(db, 'customer_orders', customerOrderRowSchema),
    rows(db, 'material_plans', materialPlanRowSchema),
    rows(db, 'shipping_drafts', shippingDraftRowSchema),
    hasPermission(db, 'orders.write'),
    hasPermission(db, 'planning.write'),
  ]);
  return {
    orders, plans, drafts, canWrite: canOrder && canPlan, locale: profile.preferred_locale,
  };
}

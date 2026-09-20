import 'server-only';
import { redirect } from 'next/navigation';
import { customerRowSchema, customerOptionRowSchema } from '@/domain/customer-pricing';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import { materialPlanRowSchema } from '@/domain/purchasing';
import { productRowSchema } from '@/domain/recipes';
import { requireAdminShell } from './auth';
import hasPermission from './permissions';
import { rows } from './data';

/** Customer master data is shared within an organization; order RLS remains facility-scoped. */
export default async function loadCustomerWorkspace() {
  const { db, profile } = await requireAdminShell();
  if (!(await hasPermission(db, 'orders.read'))) redirect('/app');
  const [canEdit, canReadOrders, canReadPrices] = await Promise.all([
    hasPermission(db, 'orders.write'),
    hasPermission(db, 'planning.read'),
    hasPermission(db, 'products.read'),
  ]);
  const [customers, orders, plans, options, products] = await Promise.all([
    rows(db, 'customers', customerRowSchema),
    canReadOrders ? rows(db, 'customer_orders', customerOrderRowSchema) : [],
    canReadOrders ? rows(db, 'material_plans', materialPlanRowSchema) : [],
    canReadPrices ? rows(db, 'customer_product_options', customerOptionRowSchema) : [],
    canReadPrices ? rows(db, 'products', productRowSchema) : [],
  ]);
  return {
    customers,
    orders,
    plans,
    options,
    products,
    canEdit,
    canReadOrders,
    canReadPrices,
    locale: profile.preferred_locale,
  };
}

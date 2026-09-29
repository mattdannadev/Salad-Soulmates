import { orderProductReturnHref } from '@/app/app/orders/order-draft';

/** Product setup may resume the onboarding checklist or an order draft. */
export default function productSetupReturnHref(input: unknown): string | null {
  if (input === undefined) return null;
  if (input === '/app') return '/app';
  return orderProductReturnHref(input);
}

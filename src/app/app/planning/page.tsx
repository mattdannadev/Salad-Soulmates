import { redirect } from 'next/navigation';

/** Order capture, estimates and later production readiness share the same entry point. */
export default function Planning() {
  redirect('/app/orders');
}

import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

/** Keep historical estimate links usable; new demand is entered only as a customer order. */
export default async function Materials({ searchParams }: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  if (plan && !z.uuid().safeParse(plan).success) notFound();
  redirect(plan ? `/app/orders?estimate=${plan}` : '/app/orders');
}

export function inventoryBalances(
  events: { ingredient_id: string; quantity_delta: number | string }[],
) {
  const balances: Record<string, number> = {};
  // Database quantities have four decimal places; sum integer ticks to avoid display drift.
  for (const event of events)
    balances[event.ingredient_id] =
      (balances[event.ingredient_id] ?? 0) + Math.round(Number(event.quantity_delta) * 10000);
  return Object.fromEntries(Object.entries(balances).map(([id, ticks]) => [id, ticks / 10000]));
}

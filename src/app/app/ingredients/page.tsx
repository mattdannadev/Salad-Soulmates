import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import inventoryBalances, { inventoryUnits } from '@/domain/inventory';
import IngredientActivityAction from '@/components/ingredient-activity-action';
import ListGrid from '@/components/list-grid';

export default async function Ingredients({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  const { db, profile } = await requireAdminShell();
  const query = await searchParams;
  const q = z.string().trim().max(120).catch('')
    .parse(query.q);
  const status = z.enum(['active', 'inactive', 'all']).catch('active').parse(query.status);
  const type = z.enum(['all', 'dry', 'wet']).catch('all').parse(query.type);
  const [allIngredients, events] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'inventory_events', rowSchemas.inventory_events),
  ]);
  const ingredients = allIngredients
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .filter((i) => status === 'all' || (status === 'active' ? i.active : !i.active))
    .filter((i) => type === 'all' || (type === 'dry' ? i.category === 'Dry' : i.category === 'Liquid'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const balances = inventoryBalances(events);
  const inventoryUnitsByIngredient = inventoryUnits(events);
  return (
    <>
      <PageHeader
        eyebrow="MASTER DATA"
        title="Ingredients library"
        description="Real ingredients. Clear measurements. A shared foundation for every recipe."
        action={
          profile.role === 'admin' && (
            <Link className="button" href="/app/ingredients/new">
              + Add ingredient
            </Link>
          )
        }
      />
      <section className="panel">
        <div className="row">
          <form className="search">
            <label className="sr-only" htmlFor="search">
              Search ingredients
            </label>
            <input id="search" name="q" placeholder="Search ingredients…" defaultValue={q} />
            <label htmlFor="ingredient-type">
              Type
              <select id="ingredient-type" name="type" defaultValue={type}>
                <option value="all">All types</option>
                <option value="dry">Dry</option>
                <option value="wet">Wet</option>
              </select>
            </label>
            <label htmlFor="ingredient-status">
              Status
              <select id="ingredient-status" name="status" defaultValue={status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">Active and inactive</option>
              </select>
            </label>
            <button type="submit" className="secondary">
              Search
            </button>
          </form>
          <Link href="/app/allergens">Manage allergens →</Link>
        </div>
        {ingredients.length ? (
          <ListGrid
            label="Ingredients library"
            columns={[
              { key: 'ingredient', label: 'Ingredient' },
              { key: 'category', label: 'Category' },
              { key: 'unit', label: 'Base unit' },
              { key: 'onHand', label: 'On hand' },
              { key: 'reorderPoint', label: 'Reorder point' },
              { key: 'par', label: 'Par level' },
              { key: 'reorderQuantity', label: 'Reorder quantity' },
              { key: 'stock', label: 'Stock status' },
              {
                key: 'details', label: 'Open ingredient', sortable: false, filterable: false,
              },
              ...(profile.role === 'admin'
                ? [{
                  key: 'availability', label: 'Availability', sortable: false, filterable: false,
                }]
                : []),
            ]}
            rows={ingredients.map((ingredient) => ({
              id: ingredient.id,
              cells: {
                ingredient: { text: ingredient.name, href: `/app/ingredients/${ingredient.id}` },
                category: { text: ingredient.category },
                unit: { text: ingredient.default_uom },
                onHand: {
                  text: `${balances[ingredient.id] ?? 0} ${inventoryUnitsByIngredient[ingredient.id] ?? ingredient.default_uom}`,
                  sortValue: balances[ingredient.id] ?? 0,
                },
                reorderPoint: { text: String(ingredient.reorder_point ?? 'Not set'), sortValue: ingredient.reorder_point ?? -1 },
                par: { text: String(ingredient.par_level ?? 'Not set'), sortValue: ingredient.par_level ?? -1 },
                reorderQuantity: { text: String(ingredient.reorder_quantity ?? 'Not set'), sortValue: ingredient.reorder_quantity ?? -1 },
                stock: ingredient.reorder_point !== null
                  && (balances[ingredient.id] ?? 0) <= ingredient.reorder_point
                  ? { text: 'Reorder', badge: 'warning' as const }
                  : { text: 'OK' },
                details: { text: 'View details →', href: `/app/ingredients/${ingredient.id}` },
                ...(profile.role === 'admin' ? {
                  availability: {
                    text: ingredient.active ? 'Deactivate' : 'Reactivate',
                    slot: ingredient.id,
                  },
                } : {}),
              },
            }))}
            cellSlots={profile.role === 'admin' ? Object.fromEntries(ingredients.map((ingredient) => [
              ingredient.id,
              <IngredientActivityAction
                key={ingredient.id}
                ingredientId={ingredient.id}
                ingredientName={ingredient.name}
                active={ingredient.active}
              />,
            ])) : undefined}
          />
        ) : (
          <div className="empty">
            <h2>{q || status !== 'active' || type !== 'all' ? 'No matching ingredients' : 'Your ingredient library starts here'}</h2>
            <p>
              {q || status !== 'active' || type !== 'all'
                ? 'Try another search.'
                : 'Add your first ingredient with its base unit and reviewed Spanish name.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

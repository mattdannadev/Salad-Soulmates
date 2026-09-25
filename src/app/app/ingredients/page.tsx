import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import inventoryBalances, { inventoryUnits } from '@/domain/inventory';

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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Category</th>
                  <th>Base unit</th>
                  <th>On hand</th>
                  <th>Reorder point</th>
                  <th>Par level</th>
                  <th>Reorder quantity</th>
                  <th>Stock status</th>
                  <th>
                    <span className="sr-only">Open ingredient</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/app/ingredients/${i.id}`}>{i.name}</Link>
                    </td>
                    <td>{i.category}</td>
                    <td>{i.default_uom}</td>
                    <td>
                      {balances[i.id] ?? 0}
                      {' '}
                      {inventoryUnitsByIngredient[i.id] ?? i.default_uom}
                    </td>
                    <td>{i.reorder_point ?? 'Not set'}</td>
                    <td>{i.par_level ?? 'Not set'}</td>
                    <td>{i.reorder_quantity ?? 'Not set'}</td>
                    <td>
                      {i.reorder_point !== null && (balances[i.id] ?? 0) <= i.reorder_point ? (
                        <span className="badge warning">Reorder</span>
                      ) : <span>OK</span>}
                    </td>
                    <td>
                      <Link href={`/app/ingredients/${i.id}`}>View details →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

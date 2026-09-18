import Link from 'next/link';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import type { Ingredient } from '@/domain/master-data';
import { PageHeader } from '@/components/shell';
export default async function Ingredients({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { db, profile } = await requireAdminShell();
  const { q = '' } = await searchParams;
  const ingredients = (await rows<Ingredient>(db, 'ingredients'))
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
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
            <button className="secondary">Search</button>
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
                  <th>Status</th>
                  <th />
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
                      <span className={`badge ${i.active ? '' : 'muted'}`}>
                        {i.active ? 'Active' : 'Inactive'}
                      </span>
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
            <h2>{q ? 'No matching ingredients' : 'Your ingredient library starts here'}</h2>
            <p>
              {q
                ? 'Try another search.'
                : 'Add your first ingredient with its base unit and reviewed Spanish name.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

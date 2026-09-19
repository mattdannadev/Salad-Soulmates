import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { selectRecipeVersion } from '@/domain/recipes';
import { formatNumber } from '@/domain/format';

export default async function Recipes() {
  const {
    products, recipes, versions, locale,
  } = await loadRecipeCatalog();
  return (
    <>
      <PageHeader
        eyebrow={recipeText(locale, 'PRODUCTION MASTER DATA')}
        title={recipeText(locale, 'Recipes')}
        description={recipeText(locale, 'Review recipe ingredients, preparation sections, quality checks and version history.')}
        action={<Link className="button secondary" href="/app/products">{recipeText(locale, 'View products')}</Link>}
      />
      <section className="panel">
        {recipes.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{recipeText(locale, 'Recipe')}</th>
                  <th>{recipeText(locale, 'Product')}</th>
                  <th>{recipeText(locale, 'Version')}</th>
                  <th>{recipeText(locale, 'Batch yield')}</th>
                </tr>
              </thead>
              <tbody>
                {[...recipes].sort((left, right) => left.name.localeCompare(right.name))
                  .map((recipe) => {
                    const product = products.find((item) => item.id === recipe.product_id);
                    if (!product) throw new Error('A recipe references an unavailable product.');
                    const version = selectRecipeVersion(recipe, versions);
                    return (
                      <tr key={recipe.id}>
                        <td><Link href={`/app/recipes/${recipe.id}`}>{recipe.name}</Link></td>
                        <td>{product.name}</td>
                        <td>{version ? `v${version.version_number} · ${recipeText(locale, version.status)}` : recipeText(locale, 'No versions')}</td>
                        <td>{version ? `${formatNumber(version.target_yield_gallons)} gal` : '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>{recipeText(locale, 'No recipes yet')}</h2>
            <p>{recipeText(locale, 'Approved recipes will appear here with their ingredient quantities and versions.')}</p>
          </div>
        )}
      </section>
    </>
  );
}

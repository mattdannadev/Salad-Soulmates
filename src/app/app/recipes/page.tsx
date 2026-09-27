import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { selectRecipeVersion } from '@/domain/recipes';
import { formatNumber } from '@/domain/format';
import ListGrid from '@/components/list-grid';

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
          <ListGrid
            label={recipeText(locale, 'Recipes')}
            locale={locale}
            columns={[
              { key: 'recipe', label: recipeText(locale, 'Recipe') },
              { key: 'product', label: recipeText(locale, 'Product') },
              { key: 'version', label: recipeText(locale, 'Version') },
              { key: 'yield', label: recipeText(locale, 'Batch yield') },
            ]}
            rows={[...recipes].sort((left, right) => left.name.localeCompare(right.name))
              .map((recipe) => {
                const product = products.find((item) => item.id === recipe.product_id);
                if (!product) throw new Error('A recipe references an unavailable product.');
                const version = selectRecipeVersion(recipe, versions);
                return {
                  id: recipe.id,
                  cells: {
                    recipe: { text: recipe.name, href: `/app/recipes/${recipe.id}` },
                    product: { text: product.name },
                    version: { text: version ? `v${version.version_number} · ${recipeText(locale, version.status)}` : recipeText(locale, 'No versions') },
                    yield: { text: version ? `${formatNumber(version.target_yield_gallons)} gal` : '—', sortValue: version?.target_yield_gallons ?? -1 },
                  },
                };
              })}
          />
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

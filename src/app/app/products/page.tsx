import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { formatNumber } from '@/domain/format';

export default async function Products() {
  const { products, recipes, locale } = await loadRecipeCatalog();
  return (
    <>
      <PageHeader
        eyebrow={recipeText(locale, 'CATALOG')}
        title={recipeText(locale, 'Products')}
        description={recipeText(locale, 'Finished dressings, their configured packaging and associated recipes.')}
        action={<Link className="button secondary" href="/app/recipes">{recipeText(locale, 'View recipes')}</Link>}
      />
      <section className="panel">
        {products.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{recipeText(locale, 'Product')}</th>
                  <th>{recipeText(locale, 'Standard batch')}</th>
                  <th>{recipeText(locale, 'Packaging')}</th>
                  <th>{recipeText(locale, 'Recipe')}</th>
                </tr>
              </thead>
              <tbody>
                {[...products].sort((left, right) => left.name.localeCompare(right.name))
                  .map((product) => {
                    const recipe = recipes.find((item) => item.product_id === product.id);
                    return (
                      <tr key={product.id}>
                        <td>
                          <strong>{product.name}</strong>
                          <p>{product.product_code ?? recipeText(locale, 'No product code')}</p>
                          <span className={`badge ${product.active ? '' : 'muted'}`}>
                            {product.active ? recipeText(locale, 'Active') : recipeText(locale, 'Inactive')}
                          </span>
                          {product.approved_ingredient_statement && (
                            <details>
                              <summary>{recipeText(locale, 'Ingredient statement')}</summary>
                              <p>{product.approved_ingredient_statement}</p>
                            </details>
                          )}
                        </td>
                        <td>
                          {formatNumber(product.standard_batch_gallons)}
                          {' '}
                          gal
                        </td>
                        <td>
                          {formatNumber(product.bag_size_gallons)}
                          {' '}
                          {recipeText(locale, 'gal per bag')}
                          <p>
                            {product.bags_per_case}
                            {' '}
                            {recipeText(locale, 'bags per case')}
                          </p>
                        </td>
                        <td>
                          {recipe ? (
                            <Link href={`/app/recipes/${recipe.id}`}>{recipe.name}</Link>
                          ) : recipeText(locale, 'No recipe linked')}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>{recipeText(locale, 'No products yet')}</h2>
            <p>{recipeText(locale, 'Approved products and packaging definitions will appear here.')}</p>
          </div>
        )}
      </section>
    </>
  );
}

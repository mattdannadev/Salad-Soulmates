import CustomerProductOptions from '@/components/customer-product-options';
import { customerRowSchema, customerOptionRowSchema } from '@/domain/customer-pricing';
import { rows } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { formatNumber } from '@/domain/format';

export default async function Products() {
  const { db, products, recipes, locale } = await loadRecipeCatalog();
  const [customers, options, canWrite] = await Promise.all([
    rows(db, 'customers', customerRowSchema),
    rows(db, 'customer_product_options', customerOptionRowSchema),
    hasPermission(db, 'products.write'),
  ]);
  return (
    <>
      <PageHeader
        eyebrow={recipeText(locale, 'CATALOG')}
        title={recipeText(locale, 'Products')}
        description={recipeText(
          locale,
          'Finished dressings, their configured packaging and associated recipes.',
        )}
        action={
          <Link className="button secondary" href="/app/recipes">
            {recipeText(locale, 'View recipes')}
          </Link>
        }
      />
      <section className="panel">
        {products.length ? (
          <div className="product-catalog">
            {[...products]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((product) => {
                const recipe = recipes.find((item) => item.product_id === product.id);
                return (
                  <article className="product-detail-card" key={product.id}>
                    <header className="product-detail-header">
                      <div>
                        <p className="detail-label">{recipeText(locale, 'Product')}</p>
                        <h2>{product.name}</h2>
                        <p className="product-code">
                          {product.product_code ?? recipeText(locale, 'No product code')}
                        </p>
                      </div>
                      <span className={`badge ${product.active ? '' : 'muted'}`}>
                        {product.active
                          ? recipeText(locale, 'Active')
                          : recipeText(locale, 'Inactive')}
                      </span>
                    </header>
                    <div className="product-detail-groups">
                      <section className="product-detail-group">
                        <h3>{recipeText(locale, 'Production')}</h3>
                        <dl>
                          <dt>{recipeText(locale, 'Standard batch')}</dt>
                          <dd>{`${formatNumber(product.standard_batch_gallons)} gal`}</dd>
                        </dl>
                      </section>
                      <section className="product-detail-group">
                        <h3>{recipeText(locale, 'Default packaging')}</h3>
                        <dl>
                          <dt>{recipeText(locale, 'Bag size')}</dt>
                          <dd>{`${formatNumber(product.bag_size_gallons)} ${recipeText(locale, 'gal per bag')}`}</dd>
                          <dt>{recipeText(locale, 'Case configuration')}</dt>
                          <dd>{`${product.bags_per_case} ${recipeText(locale, 'bags per case')}`}</dd>
                        </dl>
                      </section>
                      <section className="product-detail-group">
                        <h3>{recipeText(locale, 'Recipe')}</h3>
                        <p className="detail-value">
                          {recipe ? (
                            <Link href={`/app/recipes/${recipe.id}`}>{recipe.name}</Link>
                          ) : (
                            recipeText(locale, 'No recipe linked')
                          )}
                        </p>
                      </section>
                    </div>
                    {product.approved_ingredient_statement && (
                      <details className="ingredient-statement">
                        <summary>{recipeText(locale, 'Ingredient statement')}</summary>
                        <p>{product.approved_ingredient_statement}</p>
                      </details>
                    )}
                    <CustomerProductOptions
                      productId={product.id}
                      productName={product.name}
                      defaultGallons={product.bag_size_gallons * product.bags_per_case}
                      customers={customers}
                      options={options.filter((option) => option.product_id === product.id)}
                      canWrite={canWrite}
                      locale={locale}
                    />
                  </article>
                );
              })}
          </div>
        ) : (
          <div className="empty">
            <h2>{recipeText(locale, 'No products yet')}</h2>
            <p>
              {recipeText(locale, 'Approved products and packaging definitions will appear here.')}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

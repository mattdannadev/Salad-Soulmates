import { Fragment } from 'react';
import PackagingSetup from '@/components/packaging-setup';
import ProductRecipeDetails from '@/components/product-recipe-details';
import { packagingVersionSchema } from '@/domain/packaging';
import CustomerProductOptions from '@/components/customer-product-options';
import { customerRowSchema, customerOptionRowSchema } from '@/domain/customer-pricing';
import { rows } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { formatNumber } from '@/domain/format';
import { recipeLineRowSchema, recipeSectionRowSchema } from '@/domain/recipes';
import { rowSchemas } from '@/domain/master-data';

export default async function Products() {
  const {
    db, products, recipes, versions, locale,
  } = await loadRecipeCatalog();
  const [
    customers, options, canWrite, packagingVersions, sections, lines, ingredients,
  ] = await Promise.all([
    rows(db, 'customers', customerRowSchema),
    rows(db, 'customer_product_options', customerOptionRowSchema),
    hasPermission(db, 'products.write'),
    rows(db, 'packaging_profile_versions', packagingVersionSchema),
    rows(db, 'recipe_sections', recipeSectionRowSchema),
    rows(db, 'recipe_lines', recipeLineRowSchema),
    rows(db, 'ingredients', rowSchemas.ingredients),
  ]);
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
            <table className="product-catalog">
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
                    const activeVersion = recipe?.active_version_id
                      ? versions.find((version) => version.id === recipe.active_version_id
                        && version.recipe_id === recipe.id)
                      : undefined;
                    return (
                      <Fragment key={product.id}>
                        <tr>
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
                              <>
                                <Link href={activeVersion
                                  ? `/app/recipes/${recipe.id}?version=${activeVersion.id}`
                                  : `/app/recipes/${recipe.id}`}
                                >
                                  {activeVersion ? `${recipe.name} · v${activeVersion.version_number}` : recipe.name}
                                </Link>
                                {activeVersion && (
                                  <ProductRecipeDetails
                                    recipe={recipe}
                                    version={activeVersion}
                                    sections={sections}
                                    lines={lines}
                                    ingredients={ingredients}
                                    locale={locale}
                                  />
                                )}
                              </>
                            ) : recipeText(locale, 'No recipe linked')}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={4}>
                            <PackagingSetup
                              product={product}
                              versions={packagingVersions.filter(
                                (version) => version.product_id === product.id,
                              )}
                              canWrite={canWrite && product.active}
                              locale={locale}
                            />
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={4}>
                            <CustomerProductOptions
                              productId={product.id}
                              productName={product.name}
                              defaultGallons={product.bag_size_gallons * product.bags_per_case}
                              customers={customers}
                              options={options.filter((option) => option.product_id === product.id)}
                              canWrite={canWrite}
                              locale={locale}
                            />
                          </td>
                        </tr>
                      </Fragment>
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

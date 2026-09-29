import { Suspense } from 'react';
import Link from 'next/link';
import PackagingSetup from '@/components/packaging-setup';
import ProductRecipeDetails from '@/components/product-recipe-details';
import CustomerProductOptions from '@/components/customer-product-options';
import DirectoryToolbar from '@/components/directory-toolbar';
import ListGrid from '@/components/list-grid';
import { packagingVersionSchema } from '@/domain/packaging';
import { customerRowSchema, customerOptionRowSchema } from '@/domain/customer-pricing';
import { rows } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import recipeText from '@/domain/recipe-text';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { formatNumber } from '@/domain/format';
import { recipeLineRowSchema, recipeSectionRowSchema } from '@/domain/recipes';
import { rowSchemas } from '@/domain/master-data';
import {
  PRODUCT_PAGE_SIZE, parseProductDirectoryQuery, productDirectoryFilters,
  productDirectoryHref, productDirectorySorts, selectProductDirectory, type ProductSearchParams,
} from './directory-query';
import ProductFocus from './product-focus';

export default async function Products({
  searchParams,
}: {
  searchParams?: Promise<ProductSearchParams>;
} = {}) {
  const query = parseProductDirectoryQuery(await searchParams ?? {});
  const returnTo = productDirectoryHref(query);
  const {
    db, products, recipes, versions, locale,
  } = await loadRecipeCatalog();
  const [
    customers, options, canWrite, packagingVersions, sections, lines, ingredients, referenceOptions,
  ] = await Promise.all([
    rows(db, 'customers', customerRowSchema),
    rows(db, 'customer_product_options', customerOptionRowSchema),
    hasPermission(db, 'products.write'),
    rows(db, 'packaging_profile_versions', packagingVersionSchema),
    rows(db, 'recipe_sections', recipeSectionRowSchema),
    rows(db, 'recipe_lines', recipeLineRowSchema),
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'reference_options', rowSchemas.reference_options),
  ]);
  const es = locale === 'es';
  const records = products.map((product) => {
    const recipe = recipes.find((item) => item.product_id === product.id);
    const activeVersion = versions.find((version) => version.id === recipe?.active_version_id
      && version.recipe_id === recipe.id);
    return {
      id: product.id,
      name: product.name,
      productCode: product.product_code,
      active: product.active,
      batchGallons: product.standard_batch_gallons,
      hasReleasedRecipe: activeVersion?.status === 'Released',
      hasApprovedPackaging: packagingVersions.some((version) => version.product_id === product.id
        && version.status === 'Approved'),
      hasActivePricing: options.some((option) => option.product_id === product.id && option.active),
    };
  });
  const filtered = selectProductDirectory(records, query, locale);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PRODUCT_PAGE_SIZE));
  const visibleIds = filtered.slice(
    (query.page - 1) * PRODUCT_PAGE_SIZE,
    query.page * PRODUCT_PAGE_SIZE,
  )
    .map((record) => record.id);
  const visibleProducts = products.filter((product) => visibleIds.includes(product.id))
    .sort((left, right) => visibleIds.indexOf(left.id) - visibleIds.indexOf(right.id));
  const filters = productDirectoryFilters.map((filter) => ({
    ...filter,
    label: es ? ({
      status: 'Estado', recipe: 'Receta publicada', packaging: 'Empaque aprobado', pricing: 'Precios por cliente',
    })[filter.key] : filter.label,
    options: filter.options.map((option) => ({
      ...option,
      label: es ? ({
        active: 'Activo',
        inactive: 'Inactivo',
        released: 'Publicada',
        missing: 'Sin configurar',
        approved: 'Aprobado',
        configured: 'Configurado',
      })[option.value] : option.label,
    })),
  }));
  const sortOptions = productDirectorySorts.map((option) => ({
    ...option,
    label: es ? ({ name: 'Nombre A–Z', 'name-desc': 'Nombre Z–A', batch: 'Lote estándar más grande' })[option.value] : option.label,
  }));
  const orderUnits = referenceOptions
    .filter((option) => option.list_code === 'purchase_unit' && option.active)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((option) => ({ code: option.code, label: es ? option.label_es : option.label_en }));
  let emptyDescription = es ? 'Ajusta la búsqueda o los filtros.' : 'Try another search or filter.';
  if (query.page > pageCount) {
    emptyDescription = es ? 'Esta página ya no tiene resultados.' : 'This page no longer has results.';
  }

  return (
    <>
      <PageHeader
        eyebrow={recipeText(locale, 'CATALOG')}
        title={recipeText(locale, 'Products')}
        description={recipeText(locale, 'Finished dressings, their configured packaging and associated recipes.')}
        action={<Link className="button secondary" href="/app/recipes">{recipeText(locale, 'View recipes')}</Link>}
      />
      <section className="panel">
        <ProductFocus
          filteredIds={filtered.map((record) => record.id)}
          allIds={products.map((product) => product.id)}
          page={query.page}
          pageSize={PRODUCT_PAGE_SIZE}
          locale={locale}
        />
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={es ? 'Filtros de productos' : 'Product filters'}
            resultCount={filtered.length}
            filters={filters}
            sortOptions={sortOptions}
            locale={locale}
            mobileFilters
            pageCount={pageCount}
          />
        </Suspense>
        {!products.length && (
          <div className="empty">
            <h2>{recipeText(locale, 'No products yet')}</h2>
            <p>{recipeText(locale, 'Approved products and packaging definitions will appear here.')}</p>
            <Link href="/app/recipes">{es ? 'Ver recetas' : 'View recipes'}</Link>
          </div>
        )}
        {!!products.length && !visibleProducts.length && (
          <div className="empty">
            <h2>{es ? 'No hay productos en esta vista' : 'No products in this view'}</h2>
            <p>{emptyDescription}</p>
            <Link href="/app/products">{es ? 'Borrar todo' : 'Clear all'}</Link>
          </div>
        )}
        {!!visibleProducts.length && (
          <>
            <ListGrid
              label={es ? 'Directorio de productos' : 'Product directory'}
              locale={locale}
              searchable={false}
              controlled={{
                page: query.page,
                pageSize: PRODUCT_PAGE_SIZE,
                totalCount: filtered.length,
                sort: query.sort === 'batch' ? { key: 'batch', direction: 'desc' }
                  : { key: 'product', direction: query.sort === 'name-desc' ? 'desc' : 'asc' },
              }}
              columns={[
                { key: 'product', label: recipeText(locale, 'Product') },
                { key: 'batch', label: recipeText(locale, 'Standard batch') },
                { key: 'packaging', label: recipeText(locale, 'Packaging') },
                { key: 'recipe', label: recipeText(locale, 'Recipe') },
              ]}
              rows={visibleProducts.map((product) => {
                const recipe = recipes.find((item) => item.product_id === product.id);
                const activeVersion = versions.find(
                  (version) => version.id === recipe?.active_version_id
                    && version.recipe_id === recipe.id,
                );
                let recipeLabel: string = recipeText(locale, 'No recipe linked');
                let recipeHref: string | undefined;
                if (recipe) {
                  recipeLabel = activeVersion
                    ? `${recipe.name} · v${activeVersion.version_number}` : recipe.name;
                  const recipeParams = new URLSearchParams({ returnTo });
                  if (activeVersion) recipeParams.set('version', activeVersion.id);
                  recipeHref = `/app/recipes/${recipe.id}?${recipeParams}`;
                }
                return {
                  id: product.id,
                  cells: {
                    product: { text: product.name, secondary: product.active ? recipeText(locale, 'Active') : recipeText(locale, 'Inactive'), detailsId: `product-${product.id}` },
                    batch: { text: `${formatNumber(product.standard_batch_gallons)} gal`, sortValue: product.standard_batch_gallons },
                    packaging: { text: `${formatNumber(product.bag_size_gallons)} ${recipeText(locale, 'gal per bag')}`, secondary: `${product.bags_per_case} ${recipeText(locale, 'bags per case')}` },
                    recipe: { text: recipeLabel, href: recipeHref },
                  },
                };
              })}
            />
            <div className="table-wrap">
              {visibleProducts.map((product) => {
                const recipe = recipes.find((item) => item.product_id === product.id);
                const activeVersion = versions.find(
                  (version) => version.id === recipe?.active_version_id
                    && version.recipe_id === recipe.id,
                );
                return (
                  <details id={`product-${product.id}`} key={product.id} open>
                    <summary>{`${es ? 'Detalles del producto' : 'Product details'} · ${product.name}`}</summary>
                    {product.approved_ingredient_statement && (
                      <details>
                        <summary>{recipeText(locale, 'Ingredient statement')}</summary>
                        <p>{product.approved_ingredient_statement}</p>
                      </details>
                    )}
                    {recipe && activeVersion && (
                      <ProductRecipeDetails
                        recipe={recipe}
                        version={activeVersion}
                        sections={sections}
                        lines={lines}
                        ingredients={ingredients}
                        locale={locale}
                      />
                    )}
                    <PackagingSetup
                      product={product}
                      versions={packagingVersions.filter(
                        (version) => version.product_id === product.id,
                      )}
                      canWrite={canWrite && product.active}
                      locale={locale}
                    />
                    <CustomerProductOptions
                      productId={product.id}
                      productName={product.name}
                      defaultGallons={product.bag_size_gallons * product.bags_per_case}
                      customers={customers}
                      options={options.filter((option) => option.product_id === product.id)}
                      canWrite={canWrite}
                      locale={locale}
                      orderUnits={orderUnits}
                    />
                  </details>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );
}

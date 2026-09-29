import recipeText from '@/domain/recipe-text';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shell';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import { formatNumber } from '@/domain/format';
import ListGrid from '@/components/list-grid';
import DirectoryToolbar from '@/components/directory-toolbar';
import { returnContextSearchParams } from '@/lib/return-context';
import {
  parseRecipeDirectoryQuery, recipeDirectoryFilters, recipeDirectorySorts,
  recipeDirectoryHref, recipeDirectoryRows, type RecipeSearchParams,
} from './directory-query';
import RecipeReturnFocus from './recipe-return-focus';

const PAGE_SIZE = 20;

export default async function Recipes({
  searchParams,
}: { searchParams?: Promise<RecipeSearchParams> } = {}) {
  const rawQuery = await searchParams ?? {};
  const query = parseRecipeDirectoryQuery(rawQuery);
  const {
    products, recipes, versions, locale,
  } = await loadRecipeCatalog();
  const es = locale === 'es';
  const filteredRows = recipeDirectoryRows(recipes, products, versions, query, locale);
  const visibleRows = filteredRows.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const returnHref = recipeDirectoryHref(rawQuery);
  const spanishFilterLabels: Record<string, string> = {
    status: 'Versión mostrada', released: 'Versión publicada',
  };
  const spanishOptionLabels: Record<string, string> = {
    Draft: 'Borrador',
    Released: 'Publicada',
    Retired: 'Retirada',
    none: 'Sin versiones',
    yes: 'Disponible',
    no: 'Falta',
  };
  const filters = recipeDirectoryFilters.map((filter) => ({
    ...filter,
    label: es ? (spanishFilterLabels[filter.key] ?? filter.label) : filter.label,
    options: filter.options.map((option) => ({
      ...option,
      label: es ? (spanishOptionLabels[option.value] ?? option.label) : option.label,
    })),
  }));
  const sorts = recipeDirectorySorts.map((option) => ({
    ...option,
    label: es ? ({
      name: 'Receta A–Z',
      'name-desc': 'Receta Z–A',
      product: 'Producto A–Z',
      'version-desc': 'Versión más reciente primero',
    })[option.value] : option.label,
  }));
  let controlledSort: { key: string; direction: 'asc' | 'desc' } = {
    key: 'recipe', direction: 'asc',
  };
  if (query.sort === 'name-desc') controlledSort = { key: 'recipe', direction: 'desc' };
  if (query.sort === 'product') controlledSort = { key: 'product', direction: 'asc' };
  if (query.sort === 'version-desc') controlledSort = { key: 'version', direction: 'desc' };
  let emptyHeading: string = recipeText(locale, 'No recipes yet');
  let emptyDescription: string = recipeText(locale, 'Approved recipes will appear here with their ingredient quantities and versions.');
  if (recipes.length) {
    emptyHeading = es ? 'No hay recetas en esta vista' : 'No recipes in this view';
    emptyDescription = es ? 'Ajusta los filtros para encontrar una receta.'
      : 'Adjust the filters to find a recipe.';
    if (query.page > pageCount) {
      emptyDescription = es ? 'Esta página ya no tiene resultados.' : 'This page no longer has results.';
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={recipeText(locale, 'PRODUCTION MASTER DATA')}
        title={recipeText(locale, 'Recipes')}
        description={recipeText(locale, 'Review recipe ingredients, preparation sections, quality checks and version history.')}
        action={<Link className="button secondary" href="/app/products">{recipeText(locale, 'View products')}</Link>}
      />
      <section className="panel">
        <RecipeReturnFocus
          filteredRecipeIds={filteredRows.map(({ recipe }) => recipe.id)}
          allRecipeIds={recipes.map((recipe) => recipe.id)}
          page={query.page}
          pageSize={PAGE_SIZE}
          locale={locale}
        />
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={es ? 'Filtros de recetas' : 'Recipe filters'}
            resultCount={filteredRows.length}
            filters={filters}
            sortOptions={sorts}
            locale={locale}
            mobileFilters
            pageCount={pageCount}
          />
        </Suspense>
        {visibleRows.length ? (
          <ListGrid
            label={recipeText(locale, 'Recipes')}
            locale={locale}
            searchable={false}
            controlled={{
              page: query.page,
              pageSize: PAGE_SIZE,
              totalCount: filteredRows.length,
              sort: controlledSort,
            }}
            columns={[
              { key: 'recipe', label: recipeText(locale, 'Recipe') },
              { key: 'product', label: recipeText(locale, 'Product') },
              { key: 'version', label: recipeText(locale, 'Version') },
              { key: 'yield', label: recipeText(locale, 'Batch yield') },
            ]}
            rows={visibleRows.map(({ recipe, product, version }) => ({
              id: recipe.id,
              cells: {
                recipe: {
                  text: recipe.name,
                  href: `/app/recipes/${recipe.id}?${returnContextSearchParams({ href: returnHref })}`,
                },
                product: { text: product?.name ?? (es ? 'Producto no disponible' : 'Product unavailable') },
                version: {
                  text: version ? `v${version.version_number} · ${recipeText(locale, version.status)}`
                    : recipeText(locale, 'No versions'),
                  sortValue: version?.version_number ?? 0,
                },
                yield: {
                  text: version ? `${formatNumber(version.target_yield_gallons)} gal` : '—',
                  sortValue: version?.target_yield_gallons ?? -1,
                },
              },
            }))}
          />
        ) : (
          <div className="empty">
            <h2>{emptyHeading}</h2>
            <p>{emptyDescription}</p>
            {recipes.length > 0 && (
              <Link href="/app/recipes">{es ? 'Borrar filtros' : 'Clear all'}</Link>
            )}
            {recipes.length === 0 && (
              <Link href="/app/products">{recipeText(locale, 'View products')}</Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}

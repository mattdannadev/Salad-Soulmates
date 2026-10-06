import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows, readResult } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import IngredientForm from '@/components/ingredient-form';
import CreationDialog from '@/components/creation-dialog';
import { PageHeader } from '@/components/shell';
import inventoryBalances, { inventoryUnits } from '@/domain/inventory';
import IngredientActivityAction from '@/components/ingredient-activity-action';
import ListGrid from '@/components/list-grid';
import DirectoryToolbar from '@/components/directory-toolbar';
import { Suspense } from 'react';
import IngredientFocus from './ingredient-focus';
import { ingredientLinkHref, ingredientReturnContext } from './return-context';
import {
  ingredientDirectoryFilters, ingredientDirectorySorts,
  parseIngredientDirectoryQuery, type IngredientSearchParams,
} from './directory-query';
import { organizationMeasurementSystem, selectableUoms } from '@/services/uoms';

const PAGE_SIZE = 20;

export default async function Ingredients({
  searchParams,
}: {
  searchParams: Promise<IngredientSearchParams>;
}) {
  const { db, profile } = await requireAdminShell();
  const query = await searchParams;
  if (typeof query.status !== 'string' || !['active', 'inactive', 'all'].includes(query.status)) {
    const canonicalQuery = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((part) => {
        if (part !== undefined && key !== 'status') canonicalQuery.append(key, part);
      });
    });
    canonicalQuery.set('status', 'active');
    redirect(`/app/ingredients?${canonicalQuery}`);
  }
  const {
    q, status, type, stock, sort, page,
  } = parseIngredientDirectoryQuery(query);
  const focusRow = z.uuid().safeParse(query.focusRow);
  const directoryQuery = new URLSearchParams();
  if (q) directoryQuery.set('q', q);
  directoryQuery.set('status', status);
  if (type) directoryQuery.set('type', type);
  if (stock) directoryQuery.set('stock', stock);
  if (sort !== 'name') directoryQuery.set('sort', sort);
  if (page > 1) directoryQuery.set('page', String(page));
  const directoryHref = `/app/ingredients${directoryQuery.size ? `?${directoryQuery}` : ''}`;
  const returnContext = ingredientReturnContext(query.returnTo, undefined, directoryHref);
  const createQuery = new URLSearchParams(directoryQuery);
  createQuery.set('create', 'ingredient');
  createQuery.set('returnTo', returnContext.href);
  const addIngredientHref = `/app/ingredients?${createQuery}`;
  const [allIngredients, events, canWrite] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'inventory_events', rowSchemas.inventory_events),
    hasPermission(db, 'master_data.write'),
  ]);
  const canCreate = profile.role === 'admin' && canWrite;
  const creationData = query.create === 'ingredient' && canCreate ? await (async () => {
    const [allergens, categoryResult, measurementSystem, unitsResult] = await Promise.all([
      rows(db, 'allergens', rowSchemas.allergens),
      db.from('reference_options').select('code,label_en,label_es')
        .eq('list_code', 'ingredient_category').eq('active', true)
        .order('sort_order'),
      organizationMeasurementSystem(db),
      db.from('uoms').select('code,label_en,label_es,family_code,measurement_system')
        .eq('active', true).eq('is_inventory_unit', true)
        .order('sort_order'),
    ]);
    return {
      allergens,
      categories: readResult(
        categoryResult,
        rowSchemas.reference_options.pick({ code: true, label_en: true, label_es: true }).array(),
        'ingredient_categories',
      ),
      baseUnits: selectableUoms(readResult(
        unitsResult,
        rowSchemas.uoms.pick({
          code: true, label_en: true, label_es: true, family_code: true, measurement_system: true,
        }).array(),
        'inventory_uoms',
      ), measurementSystem),
    };
  })() : undefined;
  const balances = inventoryBalances(events);
  const inventoryUnitsByIngredient = inventoryUnits(events);
  const locale = profile.preferred_locale;
  const es = locale === 'es';
  const filters = ingredientDirectoryFilters.map((filter) => ({
    ...filter,
    label: es ? ({ type: 'Tipo', status: 'Estado', stock: 'Existencias' })[filter.key] : filter.label,
    options: filter.options.map((option) => ({
      ...option,
      label: es ? ({
        dry: 'Seco',
        wet: 'Líquido',
        active: 'Activo',
        inactive: 'Inactivo',
        all: 'Activos e inactivos',
        reorder: 'Reponer',
        ok: 'Existencias suficientes',
      })[option.value] : option.label,
    })),
  }));
  const sortOptions = ingredientDirectorySorts.map((option) => ({
    ...option,
    label: es ? ({
      name: 'Nombre A–Z', 'name-desc': 'Nombre Z–A', stock: 'Menor existencia primero',
    })[option.value] : option.label,
  }));
  const normalizedSearch = q.toLocaleLowerCase(locale);
  const ingredients = allIngredients
    .filter((ingredient) => ingredient.name.toLocaleLowerCase(locale).includes(normalizedSearch))
    .filter((ingredient) => status === 'all' || ingredient.active === (status === 'active'))
    .filter((ingredient) => !type || (type === 'dry'
      ? ingredient.category === 'Dry' : ingredient.category === 'Liquid'))
    .filter((ingredient) => {
      if (!stock) return true;
      const needsReorder = ingredient.reorder_point !== null
        && (balances[ingredient.id] ?? 0) <= ingredient.reorder_point;
      return stock === 'reorder' ? needsReorder : !needsReorder;
    })
    .sort((left, right) => {
      if (sort === 'stock') {
        const stockOrder = (balances[left.id] ?? 0) - (balances[right.id] ?? 0);
        if (stockOrder !== 0) return stockOrder;
      }
      const nameOrder = left.name.localeCompare(right.name, locale);
      return sort === 'name-desc' ? -nameOrder : nameOrder;
    });
  const pageCount = Math.max(1, Math.ceil(ingredients.length / PAGE_SIZE));
  const visibleIngredients = ingredients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const focusedIngredient = focusRow.success
    ? allIngredients.find((ingredient) => ingredient.id === focusRow.data) : undefined;
  const focusIsVisible = focusRow.success
    && visibleIngredients.some((ingredient) => ingredient.id === focusRow.data);
  let emptyHeading = es ? 'No hay ingredientes en esta vista' : 'No ingredients in this view';
  let emptyDescription = es ? 'Prueba otros filtros.' : 'Try another search or filter.';
  if (!allIngredients.length) {
    emptyHeading = es ? 'Tu biblioteca empieza aquí' : 'Your ingredient library starts here';
    emptyDescription = es
      ? 'Agrega tu primer ingrediente con su unidad base.'
      : 'Add your first ingredient with its base unit and reviewed Spanish name.';
  } else if (page > pageCount) {
    emptyDescription = es ? 'Esta página ya no tiene resultados.' : 'This page no longer has results.';
  }
  return (
    <>
      <PageHeader
        eyebrow={es ? 'DATOS MAESTROS' : 'MASTER DATA'}
        title={es ? 'Biblioteca de ingredientes' : 'Ingredients library'}
        description={es
          ? 'Ingredientes reales y medidas claras para todas las recetas.'
          : 'Real ingredients. Clear measurements. A shared foundation for every recipe.'}
        action={
          canCreate && (
            <Link className="button" href={addIngredientHref}>
              {es ? '+ Agregar ingrediente' : '+ Add ingredient'}
            </Link>
          )
        }
      />
      <section className="panel">
        {focusIsVisible && focusRow.success && <IngredientFocus rowId={focusRow.data} />}
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={es ? 'Filtros de ingredientes' : 'Ingredient filters'}
            resultCount={ingredients.length}
            filters={filters}
            sortOptions={sortOptions}
            locale={locale}
            mobileFilters
            pageCount={pageCount}
          />
        </Suspense>
        <p><Link href="/app/allergens">{es ? 'Administrar alérgenos →' : 'Manage allergens →'}</Link></p>
        {focusedIngredient && !focusIsVisible && (
          <p role="status">
            {es ? 'El ingrediente guardado está fuera de esta vista. ' : 'The saved ingredient is outside this view. '}
            <Link href={ingredientLinkHref(`/app/ingredients/${focusedIngredient.id}`, ingredientReturnContext(query.returnTo, focusedIngredient.id, directoryHref))}>
              {es ? 'Abrir ingrediente' : 'Open ingredient'}
            </Link>
          </p>
        )}
        {visibleIngredients.length ? (
          <ListGrid
            label={es ? 'Biblioteca de ingredientes' : 'Ingredients library'}
            locale={locale}
            searchable={false}
            controlled={{
              page,
              pageSize: PAGE_SIZE,
              totalCount: ingredients.length,
              sort: sort === 'stock'
                ? { key: 'onHand', direction: 'asc' }
                : { key: 'ingredient', direction: sort === 'name-desc' ? 'desc' : 'asc' },
            }}
            columns={[
              { key: 'ingredient', label: 'Ingredient' },
              { key: 'category', label: 'Category' },
              { key: 'unit', label: 'Base unit' },
              { key: 'onHand', label: 'On hand' },
              { key: 'reorderPoint', label: 'Reorder point' },
              { key: 'par', label: 'Par level' },
              { key: 'reorderQuantity', label: 'Reorder quantity' },
              { key: 'stock', label: 'Stock status' },
              ...(profile.role === 'admin'
                ? [{
                  key: 'availability', label: 'Availability', sortable: false, filterable: false,
                }]
                : []),
            ]}
            rows={visibleIngredients.map((ingredient) => ({
              id: ingredient.id,
              cells: {
                ingredient: { text: ingredient.name, href: ingredientLinkHref(`/app/ingredients/${ingredient.id}`, ingredientReturnContext(query.returnTo, ingredient.id, directoryHref)) },
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
                ...(profile.role === 'admin' ? {
                  availability: {
                    text: ingredient.active ? 'Deactivate' : 'Reactivate',
                    slot: ingredient.id,
                  },
                } : {}),
              },
            }))}
            cellSlots={profile.role === 'admin' ? Object.fromEntries(visibleIngredients.map((ingredient) => [
              ingredient.id,
              <IngredientActivityAction
                key={ingredient.id}
                ingredientId={ingredient.id}
                ingredientName={ingredient.name}
                active={ingredient.active}
              />,
            ])) : undefined}
            focusRowId={focusIsVisible && focusRow.success ? focusRow.data : undefined}
          />
        ) : (
          <div className="empty">
            <h2>{emptyHeading}</h2>
            <p>{emptyDescription}</p>
            {allIngredients.length && <Link href="/app/ingredients">{es ? 'Borrar filtros' : 'Clear all'}</Link>}
            {!allIngredients.length && canCreate && (
              <Link href={addIngredientHref}>
                {es ? 'Crear ingrediente' : 'Create ingredient'}
              </Link>
            )}
          </div>
        )}
      </section>
      {creationData && (
        <CreationDialog
          open
          title={es ? 'Agregar ingrediente' : 'Add ingredient'}
          description={es ? 'Elige la unidad de inventario y revisa el nombre en español antes de guardar.' : 'Choose your inventory unit and review the Spanish name before saving.'}
          closeHref={returnContext.href}
          closeLabel={es ? 'Cerrar creación de ingrediente' : 'Close ingredient creation'}
        >
          <IngredientForm
            allergens={creationData.allergens}
            categories={creationData.categories}
            baseUnits={creationData.baseUnits}
            locale={locale}
            returnContext={returnContext}
            directEntry={false}
          />
        </CreationDialog>
      )}
    </>
  );
}

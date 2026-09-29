import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { z } from 'zod';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import {
  rows, number, readResult,
} from '@/lib/data';
import inventoryBalances, { inventoryUnits } from '@/domain/inventory';
import InventoryAdjustmentControls from '@/components/inventory-adjustment-controls';
import { PageHeader } from '@/components/shell';
import hasPermission from '@/lib/permissions';
import ListGrid from '@/components/list-grid';
import DirectoryToolbar from '@/components/directory-toolbar';
import {
  inventoryDirectoryFilters, inventoryDirectorySorts,
  parseInventoryDirectoryQuery, selectInventoryIngredients,
  type InventorySearchParams,
} from './directory-query';

const PAGE_SIZE = 20;

const purchasePermissions = [
  'orders.read',
  'planning.read',
  'planning.write',
  'inventory.read',
  'products.read',
  'master_data.read',
];

export default async function Inventory({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<InventorySearchParams>;
} = {}) {
  const { db, profile } = await requireAdminShell();
  const query = await searchParams;
  if (typeof query.category === 'string') {
    const canonicalQuery = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((part) => {
        if (part !== undefined && key !== 'category') canonicalQuery.append(key, part);
      });
    });
    if (!query.type && query.category === 'Dry') canonicalQuery.set('type', 'dry');
    if (!query.type && query.category === 'Liquid') canonicalQuery.set('type', 'wet');
    redirect(`/app/inventory${canonicalQuery.size ? `?${canonicalQuery}` : ''}`);
  }
  if (typeof query.status !== 'string' || !['active', 'inactive', 'all'].includes(query.status)) {
    const canonicalQuery = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((part) => {
        if (part !== undefined && key !== 'status') canonicalQuery.append(key, part);
      });
    });
    canonicalQuery.set('status', 'active');
    redirect(`/app/inventory?${canonicalQuery}`);
  }
  const criteria = parseInventoryDirectoryQuery(query);
  const locale = profile.preferred_locale;
  const es = locale === 'es';
  const [ingredients, events, facility, purchasePermissionsResult, canAdjust] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'inventory_events', rowSchemas.inventory_events),
    db.from('facilities').select('name').eq('id', profile.facility_id).single(),
    Promise.all(purchasePermissions.map((permission) => hasPermission(db, permission))),
    hasPermission(db, 'inventory.adjust'),
  ]);
  const facilityData = readResult(facility, z.object({ name: z.string() }), 'inventory_facility');
  const canPurchase = purchasePermissionsResult.every(Boolean);
  const activeIngredients = ingredients.filter((ingredient) => ingredient.active);
  const balances = inventoryBalances(events);
  const receivedUnits = inventoryUnits(events);
  const filteredIngredients = selectInventoryIngredients(ingredients, balances, criteria, locale);
  const pageCount = Math.max(1, Math.ceil(filteredIngredients.length / PAGE_SIZE));
  const pageStart = (criteria.page - 1) * PAGE_SIZE;
  const visibleIngredients = filteredIngredients.slice(pageStart, pageStart + PAGE_SIZE);
  const filters = inventoryDirectoryFilters.map((filter) => ({
    ...filter,
    label: es ? ({
      type: 'Tipo de ingrediente',
      status: 'Disponibilidad',
      stock: 'Punto de reposición',
    })[filter.key] : filter.label,
    options: filter.options.map((option) => ({
      ...option,
      label: es ? ({
        dry: 'Seco',
        wet: 'Líquido',
        active: 'Activo',
        inactive: 'Inactivo',
        all: 'Activos e inactivos',
        reorder: 'Igual o menor',
        above: 'Por encima',
        unset: 'Sin configurar',
      })[option.value] : option.label,
    })),
  }));
  const sortOptions = inventoryDirectorySorts.map((option) => ({
    ...option,
    label: es ? ({
      name: 'Nombre A–Z', 'name-desc': 'Nombre Z–A', stock: 'Menor existencia primero',
    })[option.value] : option.label,
  }));
  let emptyHeading = es ? 'No hay ingredientes en esta vista' : 'No ingredients in this view';
  let emptyDescription = es ? 'Prueba otros filtros.' : 'Try another search or filter.';
  if (!ingredients.length) {
    emptyHeading = es ? 'Tu inventario empieza con un ingrediente' : 'Your inventory starts with an ingredient';
    emptyDescription = es ? 'Agrega el primer ingrediente para registrar inventario.'
      : 'Add the first ingredient to begin tracking inventory.';
  } else if (criteria.page > pageCount) {
    emptyDescription = es ? 'Esta página ya no tiene resultados.' : 'This page no longer has results.';
  }
  const recent = [...events].sort((a, b) => (
    b.effective_on.localeCompare(a.effective_on) || b.created_at.localeCompare(a.created_at)
  )).slice(0, 50);
  return (
    <>
      <PageHeader
        eyebrow={facilityData.name}
        title={es ? 'Inventario de ingredientes' : 'Ingredient inventory'}
        description={es
          ? 'Saldos iniciales y ajustes revisados para tu instalación. Cada cambio conserva su historial.'
          : 'Reviewed opening balances and adjustments for your facility. Every change keeps its history.'}
        action={
          canAdjust ? <InventoryAdjustmentControls ingredients={activeIngredients} /> : undefined
        }
      />
      <section className="panel">
        <h2>{es ? 'Existencias' : 'On hand'}</h2>
        <p>
          Owned stock includes held and expired material. Planning excludes unavailable packages.
        </p>
        <Link href="/receiving/packages">View package balances, holds, and supplier lots →</Link>
        <Link href="/app/ingredients">Manage ingredient details and availability →</Link>
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={es ? 'Filtros de inventario' : 'Inventory filters'}
            resultCount={filteredIngredients.length}
            filters={filters}
            sortOptions={sortOptions}
            locale={locale}
            mobileFilters
            pageCount={pageCount}
          />
        </Suspense>
        {visibleIngredients.length ? (
          <ListGrid
            label={es ? 'Inventario disponible' : 'On-hand inventory'}
            locale={locale}
            searchable={false}
            controlled={{
              page: criteria.page,
              pageSize: PAGE_SIZE,
              totalCount: filteredIngredients.length,
              sort: criteria.sort === 'stock'
                ? { key: 'onHand', direction: 'asc' }
                : { key: 'ingredient', direction: criteria.sort === 'name-desc' ? 'desc' : 'asc' },
            }}
            columns={[
              { key: 'ingredient', label: 'Ingredient' },
              { key: 'onHand', label: 'On hand' },
              { key: 'reorder', label: 'Reorder point' },
              { key: 'par', label: 'Par level' },
              ...(canPurchase ? [{
                key: 'purchase', label: 'Purchase', sortable: false, filterable: false,
              }] : []),
              ...(canAdjust ? [{
                key: 'adjust', label: 'Adjust', sortable: false, filterable: false,
              }] : []),
            ]}
            rows={visibleIngredients.map((ingredient) => {
              const unit = receivedUnits[ingredient.id] ?? ingredient.default_uom;
              const quantity = balances[ingredient.id] ?? 0;
              const reorderPoint = ingredient.reorder_point ?? null;
              const parLevel = ingredient.par_level ?? null;
              return {
                id: ingredient.id,
                cells: {
                  ingredient: { text: ingredient.name, href: `/app/ingredients/${ingredient.id}` },
                  onHand: {
                    text: `${number(quantity)} ${unit}`,
                    secondary: reorderPoint !== null
                      && quantity <= reorderPoint ? 'At or below reorder point' : undefined,
                    sortValue: quantity,
                  },
                  reorder: {
                    text: reorderPoint === null ? 'Not set' : `${number(reorderPoint)} ${unit}`,
                    sortValue: reorderPoint ?? -1,
                  },
                  par: {
                    text: parLevel === null ? 'Not set' : `${number(parLevel)} ${unit}`,
                    sortValue: parLevel ?? -1,
                  },
                  ...(canPurchase ? {
                    purchase: ingredient.active
                      ? { text: 'Purchase', href: `/app/purchasing?ingredient=${ingredient.id}` }
                      : { text: 'Unavailable' },
                  } : {}),
                  ...(canAdjust ? {
                    adjust: ingredient.active
                      ? { text: 'Adjust', slot: ingredient.id }
                      : { text: 'Unavailable' },
                  } : {}),
                },
              };
            })}
            cellSlots={canAdjust ? Object.fromEntries(visibleIngredients
              .filter((ingredient) => ingredient.active)
              .map((ingredient) => [
                ingredient.id,
                <InventoryAdjustmentControls
                  key={ingredient.id}
                  ingredients={[ingredient]}
                  ingredientToAdjustId={ingredient.id}
                />,
              ])) : undefined}
          />
        ) : (
          <div className="empty">
            <h3>{emptyHeading}</h3>
            <p>{emptyDescription}</p>
            <Link href="/app/inventory?status=active">{es ? 'Borrar filtros →' : 'Clear filters →'}</Link>
            {!ingredients.length && profile.role === 'admin' && (
              <Link href="/app/ingredients/new">{es ? 'Agregar ingrediente →' : 'Add ingredient →'}</Link>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Recent history</h2>
        <p>
          Latest
          {' '}
          {recent.length}
          {' '}
          of
          {' '}
          {events.length}
          {' '}
          entries · Times in America/Chicago
        </p>
        {recent.length ? (
          <ListGrid
            label="Recent inventory history"
            columns={[
              { key: 'date', label: 'Effective date' },
              { key: 'ingredient', label: 'Ingredient' },
              { key: 'type', label: 'Type' },
              { key: 'change', label: 'Change' },
              { key: 'reason', label: 'Reason', minWidth: 220 },
            ]}
            rows={recent.map((event) => ({
              id: event.id,
              cells: {
                date: { text: event.effective_on },
                ingredient: { text: ingredients.find((item) => item.id === event.ingredient_id)?.name ?? 'Unavailable' },
                type: {
                  text: ({
                    OpeningBalance: 'Opening balance',
                    Receipt: 'Purchase order receipt',
                    ManualGain: 'Manual gain',
                    ManualShrink: 'Manual shrink',
                    OrderUsage: 'Usage for filling orders',
                  }[event.event_type] ?? event.event_type),
                },
                change: { text: `${Number(event.quantity_delta) > 0 ? '+' : ''}${number(Number(event.quantity_delta))} ${event.uom}`, sortValue: Number(event.quantity_delta) },
                reason: { text: event.reason_note },
              },
            }))}
          />
        ) : (
          <p className="empty">No inventory entries yet.</p>
        )}
      </section>
    </>
  );
}

import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import {
  rows, number, readResult,
} from '@/lib/data';
import inventoryBalances, { inventoryUnits } from '@/domain/inventory';
import InventoryAdjustmentControls from '@/components/inventory-adjustment-controls';
import { PageHeader } from '@/components/shell';
import hasPermission from '@/lib/permissions';
import ListGrid from '@/components/list-grid';

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
  searchParams?: Promise<{ q?: string; category?: string; status?: string }>;
} = {}) {
  const { db, profile } = await requireAdminShell();
  const query = await searchParams;
  const q = z
    .string().trim().max(120).catch('')
    .parse(query.q)
    .toLowerCase();
  const status = z.enum(['active', 'inactive', 'all']).catch('active').parse(query.status);
  const [ingredients, events, facility, purchasePermissionsResult, canAdjust] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'inventory_events', rowSchemas.inventory_events),
    db.from('facilities').select('name').eq('id', profile.facility_id).single(),
    Promise.all(purchasePermissions.map((permission) => hasPermission(db, permission))),
    hasPermission(db, 'inventory.adjust'),
  ]);
  const facilityData = readResult(facility, z.object({ name: z.string() }), 'inventory_facility');
  const canPurchase = purchasePermissionsResult.every(Boolean);
  const categories = [...new Set(ingredients.map((ingredient) => ingredient.category))].sort();
  const category = z
    .string().trim().max(120).catch('all')
    .parse(query.category);
  const filteredIngredients = ingredients
    .filter((ingredient) => ingredient.name.toLowerCase().includes(q))
    .filter((ingredient) => status === 'all' || ingredient.active === (status === 'active'))
    .filter((ingredient) => category === 'all' || ingredient.category === category);
  const activeIngredients = ingredients.filter((ingredient) => ingredient.active);
  const balances = inventoryBalances(events);
  const receivedUnits = inventoryUnits(events);
  const recent = [...events].sort((a, b) => (
    b.effective_on.localeCompare(a.effective_on) || b.created_at.localeCompare(a.created_at)
  )).slice(0, 50);
  return (
    <>
      <PageHeader
        eyebrow={facilityData.name}
        title="Ingredient inventory"
        description="Reviewed opening balances and adjustments for your facility. Every change keeps its history."
        action={
          canAdjust ? <InventoryAdjustmentControls ingredients={activeIngredients} /> : undefined
        }
      />
      <section className="panel">
        <h2>On hand</h2>
        <p>
          Owned stock includes held and expired material. Planning excludes unavailable packages.
        </p>
        <Link href="/receiving/packages">View package balances, holds, and supplier lots →</Link>
        <Link href="/app/ingredients">Manage ingredient details and availability →</Link>
        <form className="search inventory-filters">
          <label className="inventory-filter-search" htmlFor="inventory-search">
            <span className="sr-only">Search ingredients</span>
            <input id="inventory-search" name="q" placeholder="Search ingredients…" defaultValue={query.q} />
          </label>
          <label className="inventory-filter-field" htmlFor="inventory-category">
            <span>Ingredient type</span>
            <select id="inventory-category" name="category" defaultValue={category}>
              <option value="all">All types</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-filter-field" htmlFor="inventory-status">
            <span>Availability</span>
            <select id="inventory-status" name="status" defaultValue={status}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">Active and inactive</option>
            </select>
          </label>
          <button type="submit" className="secondary">Filter</button>
          <Link
            className="inventory-clear-filters"
            href="/app/inventory"
            aria-label="Clear inventory filters"
            title="Clear filters"
          >
            <span aria-hidden="true">×</span>
            <span>Clear</span>
          </Link>
        </form>
        {filteredIngredients.length ? (
          <ListGrid
            label="On-hand inventory"
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
            rows={filteredIngredients.map((ingredient) => {
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
            cellSlots={canAdjust ? Object.fromEntries(filteredIngredients
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
            <h3>No matching ingredients</h3>
            <Link href="/app/inventory">Clear filters →</Link>
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

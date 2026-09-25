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
          <div className="table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>On hand</th>
                  <th>Reorder point</th>
                  <th>Par level</th>
                  {canPurchase && <th>Purchase</th>}
                  {canAdjust && <th>Adjust</th>}
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/app/ingredients/${i.id}`}>{i.name}</Link>
                    </td>
                    <td className="inventory-on-hand">
                      <span>
                        {number(balances[i.id] ?? 0)}
                        {' '}
                        {receivedUnits[i.id] ?? i.default_uom}
                      </span>
                      {i.reorder_point !== null && i.reorder_point !== undefined
                        && (balances[i.id] ?? 0) <= i.reorder_point && (
                        <small className="inventory-stock-alert">At or below reorder point</small>
                      )}
                    </td>
                    <td>
                      {i.reorder_point === null || i.reorder_point === undefined ? 'Not set' : (
                        <>
                          {number(i.reorder_point)}
                          {' '}
                          {receivedUnits[i.id] ?? i.default_uom}
                        </>
                      )}
                    </td>
                    <td>
                      {i.par_level === null || i.par_level === undefined ? 'Not set' : (
                        <>
                          {number(i.par_level)}
                          {' '}
                          {receivedUnits[i.id] ?? i.default_uom}
                        </>
                      )}
                    </td>
                    {canPurchase && (
                      <td>
                        {i.active ? (
                          <Link
                            className="button"
                            href={`/app/purchasing?ingredient=${i.id}`}
                            aria-label={`Purchase ${i.name}`}
                          >
                            Purchase
                          </Link>
                        ) : 'Unavailable'}
                      </td>
                    )}
                    {canAdjust && (
                      <td>
                        {i.active ? (
                          <InventoryAdjustmentControls
                            ingredients={[i]}
                            ingredientToAdjustId={i.id}
                          />
                        ) : 'Unavailable'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Effective date</th>
                  <th>Ingredient</th>
                  <th>Type</th>
                  <th>Change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>{e.effective_on}</td>
                    <td>
                      {ingredients.find((i) => i.id === e.ingredient_id)?.name ?? 'Unavailable'}
                    </td>
                    <td>
                      {({
                        OpeningBalance: 'Opening balance',
                        Receipt: 'Purchase order receipt',
                        ManualGain: 'Manual gain',
                        ManualShrink: 'Manual shrink',
                        OrderUsage: 'Usage for filling orders',
                      }[e.event_type] ?? e.event_type)}
                    </td>
                    <td>
                      {Number(e.quantity_delta) > 0 ? '+' : ''}
                      {number(Number(e.quantity_delta))}
                      {' '}
                      {e.uom}
                    </td>
                    <td>{e.reason_note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No inventory entries yet.</p>
        )}
      </section>
    </>
  );
}

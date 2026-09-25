import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import {
  rows, number, readResult,
} from '@/lib/data';
import inventoryBalances, { inventoryUnits } from '@/domain/inventory';
import InventoryForm from '@/components/inventory-form';
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

export default async function Inventory() {
  const { db, profile } = await requireAdminShell();
  const [ingredients, events, facility, purchasePermissionsResult, canAdjust] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'inventory_events', rowSchemas.inventory_events),
    db.from('facilities').select('name').eq('id', profile.facility_id).single(),
    Promise.all(purchasePermissions.map((permission) => hasPermission(db, permission))),
    hasPermission(db, 'inventory.adjust'),
  ]);
  const facilityData = readResult(facility, z.object({ name: z.string() }), 'inventory_facility');
  const canPurchase = purchasePermissionsResult.every(Boolean);
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
      />
      <section className="panel">
        <h2>On hand</h2>
        <p>
          Owned stock includes held and expired material. Planning excludes unavailable packages.
        </p>
        <Link href="/receiving/packages">View package balances, holds, and supplier lots →</Link>
        {ingredients.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>On hand</th>
                  <th>Status</th>
                  {canPurchase && <th>Purchase</th>}
                </tr>
              </thead>
              <tbody>
                {ingredients.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/app/ingredients/${i.id}`}>{i.name}</Link>
                    </td>
                    <td>
                      {number(balances[i.id] ?? 0)}
                      {' '}
                      {receivedUnits[i.id] ?? i.default_uom}
                    </td>
                    <td>
                      {(balances[i.id] ?? 0) < 0 ? (
                        <span className="badge warning">Review negative balance</span>
                      ) : (
                        <span>
                          {events.some((e) => e.ingredient_id === i.id)
                            ? 'Recorded'
                            : 'Not entered'}
                        </span>
                      )}
                    </td>
                    {canPurchase && (
                      <td>
                        {i.active ? (
                          <Link
                            className="button secondary"
                            href={`/app/purchasing?ingredient=${i.id}`}
                            aria-label={`Purchase ${i.name}`}
                          >
                            Purchase
                          </Link>
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
            <h3>No ingredients yet</h3>
            <Link href="/app/ingredients">Build your ingredient library →</Link>
          </div>
        )}
      </section>
      {canAdjust && ingredients.some((i) => i.active) && (
        <section className="panel">
          <InventoryForm ingredients={ingredients.filter((i) => i.active)} />
        </section>
      )}
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

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import { number, rows } from '@/lib/data';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import {
  lotOriginLabel, traceQuerySchema,
} from '@/domain/traceability';
import {
  findProductionLots, loadBackwardTrace, loadForwardTrace, traceabilityProductSchema,
} from '@/lib/traceability-data';

export const dynamic = 'force-dynamic';

function lotOrigin(origin: 'supplier_provided' | 'salad_soulmates_assigned') {
  return <small>{lotOriginLabel(origin)}</small>;
}

export default async function Traceability({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db } = await requireAdminShell();
  const requiredPermissions = ['inventory.read', 'orders.read', 'planning.read'];
  const permissions = await Promise.all(
    requiredPermissions.map((permission) => hasPermission(db, permission)),
  );
  if (permissions.some((allowed) => !allowed)) redirect('/app');
  const query = traceQuerySchema.safeParse(await searchParams);
  const products = await rows(db, 'products', traceabilityProductSchema);
  const backward = query.success && query.data.productionLot
    ? await loadBackwardTrace(db, query.data.productionLot)
    : undefined;
  const lotMatches = query.success && query.data.product && query.data.lot && !backward
    ? await findProductionLots(db, query.data.product, query.data.lot)
    : undefined;
  const forward = query.success && (query.data.sourceLot || query.data.package)
    ? await loadForwardTrace(db, query.data.sourceLot, query.data.package)
    : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Traceability"
        title="Lot genealogy lookup"
        description="Read-only trace evidence. DDDYY is internal; Source Lots retain their recorded origin."
      />
      <section className="panel">
        <h2>Backward: production lot to source material</h2>
        <p>
          Find the internal DDDYY group with its product, then open its recorded batches
          and source-package allocations.
        </p>
        <form className="record-form" action="/app/traceability">
          <label htmlFor="product">
            Product
            <select id="product" name="product" defaultValue={query.success ? query.data.product : ''} required>
              <option value="">Choose a product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </label>
          <label htmlFor="lot">
            Internal DDDYY production lot
            <input
              id="lot"
              name="lot"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              placeholder="26126"
              defaultValue={query.success ? query.data.lot : ''}
              required
            />
          </label>
          <button type="submit">Find production lot</button>
        </form>
        {lotMatches && (
          <div className="serial-grid">
            {lotMatches.items.map((lot) => (
              <Link className="serial-card" key={lot.id} href={`/app/traceability?productionLot=${lot.id}`}>
                <strong>
                  {lot.product_name}
                  {' '}
                  ·
                  {' '}
                  {lot.production_lot_code}
                </strong>
                <span>
                  Assigned
                  {lot.assigned_on}
                  {' '}
                  ·
                  {lot.planned_batch_count}
                  {' '}
                  planned batches
                </span>
                <small>
                  Internal production lot ·
                  {lot.status}
                </small>
              </Link>
            ))}
            {!lotMatches.items.length && <p className="empty">No matching production lot in your facility.</p>}
          </div>
        )}
      </section>
      {backward && (
        <section className="panel">
          <h2>
            {backward.lot.product_name}
            {' '}
            · internal lot
            {' '}
            {backward.lot.production_lot_code}
          </h2>
          <p>
            Assigned
            {backward.lot.assigned_on}
            . This code is internal only and is not a customer-facing label lot.
          </p>
          <h3>Batches</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Target</th>
                  <th>Worksheet</th>
                </tr>
              </thead>
              <tbody>
                {backward.batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      Batch
                      {batch.sequence}
                    </td>
                    <td>
                      {number(batch.target_gallons)}
                      {' '}
                      gal
                    </td>
                    <td>{batch.worksheet_status ?? 'Not opened'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Recorded source allocations</h3>
          {backward.allocations.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Ingredient</th>
                    <th>Source lot</th>
                    <th>Package</th>
                    <th>Receipt</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {backward.allocations.map((allocation) => (
                    <tr key={allocation.usage_id}>
                      <td>{allocation.batch_sequence}</td>
                      <td>{allocation.ingredient_name}</td>
                      <td>
                        {allocation.source_lot}
                        <br />
                        {lotOrigin(allocation.source_lot_origin)}
                      </td>
                      <td>{allocation.package_serial}</td>
                      <td>
                        {allocation.supplier_name}
                        {' '}
                        ·
                        {' '}
                        {allocation.received_on}
                      </td>
                      <td>{number(allocation.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No source-package allocations have been recorded for this lot.</p>}
        </section>
      )}
      <section className="panel">
        <h2>Forward: source material to affected batches</h2>
        <p>
          Use an exact Source Lot or serialized package UUID. A Source Lot is receipt-scoped,
          so matching text includes supplier, ingredient, and receipt context.
        </p>
        <form className="record-form" action="/app/traceability">
          <label htmlFor="sourceLot">
            Source Lot
            <input id="sourceLot" name="sourceLot" maxLength={120} defaultValue={query.success ? query.data.sourceLot : ''} />
          </label>
          <label htmlFor="package">
            Serialized package UUID
            <input id="package" name="package" maxLength={36} defaultValue={query.success ? query.data.package : ''} />
          </label>
          <button type="submit">Find affected batches</button>
        </form>
        {forward && (
        <>
          <h3>Receipt-scoped source matches</h3>
          {forward.matches.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source lot</th>
                    <th>Origin</th>
                    <th>Ingredient</th>
                    <th>Supplier</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {forward.matches.map((match) => (
                    <tr key={match.receipt_line_id}>
                      <td>{match.source_lot}</td>
                      <td>{lotOrigin(match.source_lot_origin)}</td>
                      <td>{match.ingredient_name}</td>
                      <td>{match.supplier_name}</td>
                      <td>{match.received_on}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No matching receipt or package is visible in your facility.</p>}
          <h3>Affected production batches</h3>
          {forward.affected_batches.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Internal lot</th>
                    <th>Batch</th>
                    <th>Package</th>
                    <th>Source lot</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {forward.affected_batches.map((batch) => (
                    <tr key={batch.usage_id}>
                      <td>{batch.product_name}</td>
                      <td>
                        {batch.production_lot_code}
                        <br />
                        <small>{batch.assigned_on}</small>
                      </td>
                      <td>{batch.batch_sequence}</td>
                      <td>{batch.package_serial}</td>
                      <td>
                        {batch.source_lot}
                        <br />
                        {lotOrigin(batch.source_lot_origin)}
                      </td>
                      <td>{number(batch.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No worksheet usage has connected this source material to a production batch.</p>}
        </>
        )}
      </section>
    </>
  );
}

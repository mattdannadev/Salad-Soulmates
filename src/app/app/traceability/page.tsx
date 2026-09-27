import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import ListGrid from '@/components/list-grid';
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
          <ListGrid
            label="Production batches"
            columns={[
              { key: 'batch', label: 'Batch' },
              { key: 'target', label: 'Target' },
              { key: 'worksheet', label: 'Worksheet' },
            ]}
            rows={backward.batches.map((batch) => ({
              id: batch.id,
              cells: {
                batch: { text: `Batch ${batch.sequence}`, sortValue: batch.sequence },
                target: { text: `${number(batch.target_gallons)} gal`, sortValue: batch.target_gallons },
                worksheet: { text: batch.worksheet_status ?? 'Not opened' },
              },
            }))}
          />
          <h3>Recorded source allocations</h3>
          {backward.allocations.length ? (
            <ListGrid
              label="Recorded source allocations"
              columns={[
                { key: 'batch', label: 'Batch' },
                { key: 'ingredient', label: 'Ingredient' },
                { key: 'lot', label: 'Source lot' },
                { key: 'package', label: 'Package' },
                { key: 'receipt', label: 'Receipt' },
                { key: 'quantity', label: 'Quantity' },
              ]}
              rows={backward.allocations.map((allocation) => ({
                id: allocation.usage_id,
                cells: {
                  batch: {
                    text: String(allocation.batch_sequence), sortValue: allocation.batch_sequence,
                  },
                  ingredient: { text: allocation.ingredient_name },
                  lot: {
                    text: allocation.source_lot,
                    secondary: lotOriginLabel(allocation.source_lot_origin),
                  },
                  package: { text: allocation.package_serial },
                  receipt: { text: allocation.supplier_name, secondary: allocation.received_on },
                  quantity: { text: number(allocation.quantity), sortValue: allocation.quantity },
                },
              }))}
            />
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
            <ListGrid
              label="Receipt-scoped source matches"
              columns={[
                { key: 'lot', label: 'Source lot' },
                { key: 'origin', label: 'Origin' },
                { key: 'ingredient', label: 'Ingredient' },
                { key: 'supplier', label: 'Supplier' },
                { key: 'received', label: 'Received' },
              ]}
              rows={forward.matches.map((match) => ({
                id: match.receipt_line_id,
                cells: {
                  lot: { text: match.source_lot },
                  origin: { text: lotOriginLabel(match.source_lot_origin) },
                  ingredient: { text: match.ingredient_name },
                  supplier: { text: match.supplier_name },
                  received: { text: match.received_on },
                },
              }))}
            />
          ) : <p className="empty">No matching receipt or package is visible in your facility.</p>}
          <h3>Affected production batches</h3>
          {forward.affected_batches.length ? (
            <ListGrid
              label="Affected production batches"
              columns={[
                { key: 'product', label: 'Product' },
                { key: 'lot', label: 'Internal lot' },
                { key: 'batch', label: 'Batch' },
                { key: 'package', label: 'Package' },
                { key: 'source', label: 'Source lot' },
                { key: 'quantity', label: 'Quantity' },
              ]}
              rows={forward.affected_batches.map((batch) => ({
                id: batch.usage_id,
                cells: {
                  product: { text: batch.product_name },
                  lot: { text: batch.production_lot_code, secondary: batch.assigned_on },
                  batch: { text: String(batch.batch_sequence), sortValue: batch.batch_sequence },
                  package: { text: batch.package_serial },
                  source: {
                    text: batch.source_lot,
                    secondary: lotOriginLabel(batch.source_lot_origin),
                  },
                  quantity: { text: number(batch.quantity), sortValue: batch.quantity },
                },
              }))}
            />
          ) : <p className="empty">No worksheet usage has connected this source material to a production batch.</p>}
        </>
        )}
      </section>
    </>
  );
}

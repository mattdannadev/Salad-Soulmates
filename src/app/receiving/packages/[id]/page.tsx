import Link from 'next/link';
import { z } from 'zod';
import { notFound, redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import loadSerializedUnits from '@/lib/receiving-data';
import { readResult } from '@/lib/data';
import { unitEventSchema } from '@/domain/receiving';
import { formatDate, formatNumber } from '@/domain/format';
import PackageChangeForm from '@/components/package-change-form';

export const dynamic = 'force-dynamic';

export default async function PackageDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { db, profile } = await requireProfile();
  if (!(await hasPermission(db, 'inventory.read'))) redirect('/app');
  const [units, canChange, response] = await Promise.all([
    loadSerializedUnits(db, { unit_filter: id.data }),
    hasPermission(db, 'inventory.adjust'),
    db
      .from('serialized_unit_events')
      .select('*')
      .eq('unit_id', id.data)
      .order('expected_revision', { ascending: false })
      .limit(100),
  ]);
  const [unit] = units;
  if (!unit) notFound();
  const events = readResult(response, z.array(unitEventSchema), 'package_history');
  return (
    <main className="worker-page package-detail">
      <Link href="/receiving/packages">← Find a package</Link>
      <p className="eyebrow">SERIALIZED INGREDIENT</p>
      <h1>{unit.ingredient_name}</h1>
      <p className="serial-code">{unit.internal_code}</p>
      <section className="panel">
        <span className="badge">{unit.availability}</span>
        <h2>
          {formatNumber(unit.remaining_quantity)}
          {' '}
          {unit.uom}
          {' '}
          remaining
        </h2>
        <dl className="package-facts">
          <dt>Original package</dt>
          <dd>
            {formatNumber(unit.initial_quantity)}
            {' '}
            {unit.uom}
          </dd>
          <dt>Supplier</dt>
          <dd>{unit.supplier_name}</dd>
          <dt>Source lot</dt>
          <dd>{unit.source_lot || 'Not recorded'}</dd>
          <dt>Source-lot origin</dt>
          <dd>
            {unit.source_lot_origin === 'supplier_provided'
              ? 'Supplier-provided'
              : 'Salad Soulmates-assigned fallback'}
          </dd>
          <dt>Supplier-provided lot</dt>
          <dd>{unit.supplier_lot || 'Not provided'}</dd>
          <dt>Supplier barcode</dt>
          <dd>{unit.supplier_barcode ?? 'Internal label used'}</dd>
          <dt>Received</dt>
          <dd>{formatDate(unit.received_on)}</dd>
          <dt>Expiration</dt>
          <dd>{unit.expiration_date ? formatDate(unit.expiration_date) : 'Not recorded'}</dd>
          <dt>Reference</dt>
          <dd>{unit.supplier_reference || '—'}</dd>
        </dl>
        {unit.availability !== 'Available' && (
          <p className="error-notice">
            Unavailable for production. A hold release cannot override expiration or an empty
            balance.
          </p>
        )}
        <Link href={`/receiving/labels?unit=${unit.id}`}>Print this package label</Link>
      </section>
      {canChange && (
        <PackageChangeForm key={unit.revision} unit={unit} locale={profile.preferred_locale} />
      )}
      <section className="panel">
        <h2>Package history</h2>
        <p>
          Received
          {' '}
          {formatNumber(unit.initial_quantity)}
          {' '}
          {unit.uom}
          {' '}
          on
          {' '}
          {formatDate(unit.received_on)}
          .
        </p>
        {events.map((event) => (
          <article key={event.id} className="serial-history">
            <strong>
              {event.status}
              {' '}
              ·
              {formatNumber(event.remaining_quantity)}
              {' '}
              {unit.uom}
              {' '}
              remaining
            </strong>
            <p>{event.reason}</p>
            <small>{formatDate(event.created_at)}</small>
          </article>
        ))}
        {events.length === 0 && <p>No balance or status changes.</p>}
        {events.length === 100 && <p>Showing the latest 100 changes.</p>}
      </section>
    </main>
  );
}

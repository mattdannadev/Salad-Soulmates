import Link from 'next/link';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import loadSerializedUnits from '@/lib/receiving-data';
import { formatNumber } from '@/domain/format';

export const dynamic = 'force-dynamic';

export default async function Packages({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { db } = await requireProfile();
  if (!(await hasPermission(db, 'inventory.read'))) redirect('/app');
  const search = z
    .string()
    .trim()
    .max(120)
    .safeParse((await searchParams).q ?? '');
  const units = search.success ? await loadSerializedUnits(db, { search_text: search.data }) : [];
  return (
    <main className="worker-page">
      <Link href="/receiving">← Receiving</Link>
      <h1>Find a package</h1>
      <form className="serial-search" action="/receiving/packages">
        <label htmlFor="lookup">
          Scan or enter a barcode, source lot, or ingredient
          <input
            id="lookup"
            name="q"
            defaultValue={search.success ? search.data : ''}
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <button type="submit">Find package</button>
      </form>
      {!search.success && <p role="alert">Search must be 120 characters or fewer.</p>}
      <p>
        {units.length}
        {' '}
        matching packages · Up to 200 results. Narrow the search by barcode or source
        lot.
      </p>
      {units.length === 0 && (
        <p className="empty">
          No matching package in your facility. Check the barcode or source lot.
        </p>
      )}
      <div className="serial-grid">
        {units.map((unit) => (
          <Link className="serial-card" key={unit.id} href={`/receiving/packages/${unit.id}`}>
            <strong>{unit.ingredient_name}</strong>
            <span>
              Source lot
              {' '}
              {unit.source_lot || '—'}
              {' '}
              ·
              {formatNumber(unit.remaining_quantity)}
              {' '}
              {unit.uom}
            </span>
            <span className="badge">{unit.availability}</span>
            <small>
              {unit.source_lot_origin === 'supplier_provided'
                ? 'Supplier-provided'
                : 'Salad Soulmates-assigned'}
            </small>
            <small>{unit.supplier_barcode ?? unit.internal_code}</small>
          </Link>
        ))}
      </div>
    </main>
  );
}

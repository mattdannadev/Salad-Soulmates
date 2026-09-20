import { Buffer } from 'node:buffer';
import bwipjs from 'bwip-js/node';
import Image from 'next/image';
import Link from 'next/link';
import { z } from 'zod';
import { notFound, redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import loadSerializedUnits from '@/lib/receiving-data';
import { formatNumber } from '@/domain/format';
import PrintLabels from '@/components/print-labels';

export const dynamic = 'force-dynamic';

export default async function Labels({ searchParams }: {
  searchParams: Promise<{ receipt?: string; unit?: string }>;
}) {
  const input = z.object({ receipt: z.uuid().optional(), unit: z.uuid().optional() })
    .refine((value) => Boolean(value.receipt) !== Boolean(value.unit))
    .safeParse(await searchParams);
  if (!input.success) notFound();
  const { db } = await requireProfile();
  if (!await hasPermission(db, 'inventory.read')) redirect('/app');
  const units = await loadSerializedUnits(db, {
    receipt_filter: input.data.receipt, unit_filter: input.data.unit,
  });
  if (!units.length) notFound();
  return (
    <main className="label-page">
      <div className="no-print">
        <Link href="/receiving">← Receiving</Link>
        <h1>Ingredient package labels</h1>
        <p>
          Print at actual size. Reprinting preserves the same package identity.
          Scan the QR code or type its serial.
        </p>
        <PrintLabels />
      </div>
      <div className="label-grid">
        {units.map((unit) => {
          const svg = bwipjs.toSVG({
            bcid: 'qrcode', text: unit.internal_code, scale: 3, padding: 4,
          });
          return (
            <article key={unit.id} className="package-label">
              <strong>SALAD SOULMATES</strong>
              <h2>{unit.ingredient_name}</h2>
              <Image
                unoptimized
                src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`}
                alt={`QR barcode ${unit.internal_code}`}
                width={130}
                height={130}
              />
              <p>
                {unit.supplier_name}
                {' '}
                · Lot
                {' '}
                {unit.supplier_lot || '—'}
              </p>
              <p>
                Received
                {' '}
                {unit.received_on}
                {' '}
                · Original
                {' '}
                {formatNumber(unit.initial_quantity)}
                {' '}
                {unit.uom}
              </p>
              <p>
                Expires
                {' '}
                {unit.expiration_date ?? 'Not recorded'}
              </p>
              <small>{unit.internal_code}</small>
              {unit.supplier_barcode && (
              <small>
                Supplier barcode:
                {' '}
                {unit.supplier_barcode}
              </small>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}

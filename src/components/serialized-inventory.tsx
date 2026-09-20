import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import loadSerializedUnits from '@/lib/receiving-data';
import { formatNumber } from '@/domain/format';
import hasPermission from '@/lib/permissions';

export default async function SerializedInventory({ db, locale = 'en' }: {
  db: SupabaseClient<Database>; locale?: 'en' | 'es';
}) {
  if (!await hasPermission(db, 'inventory.read')) return null;
  const units = await loadSerializedUnits(db);
  const es = locale === 'es';
  return (
    <section className="panel">
      <h2>{es ? 'Paquetes identificados' : 'Serialized packages'}</h2>
      <form action="/receiving/packages" className="serial-search">
        <label htmlFor="package-search">
          {es ? 'Escanea o escribe un código, lote o ingrediente' : 'Scan or enter a barcode, supplier lot, or ingredient'}
          <input id="package-search" name="q" maxLength={120} autoComplete="off" />
        </label>
        <button type="submit">{es ? 'Buscar paquete' : 'Find package'}</button>
      </form>
      <p>
        {es ? 'Últimos paquetes (máximo 200). Cada paquete conserva su lote y saldo.'
          : 'Latest packages (up to 200). Open a package for its supplier lot, balance, labels, and history.'}
      </p>
      {units.length === 0 ? <p className="empty">{es ? 'Aún no hay paquetes identificados.' : 'No serialized packages yet.'}</p>
        : (
          <div className="serial-grid">
            {units.slice(0, 6).map((unit) => (
              <Link className="serial-card" key={unit.id} href={`/receiving/packages/${unit.id}`}>
                <strong>{unit.ingredient_name}</strong>
                <span>
                  {unit.supplier_lot || '—'}
                  {' '}
                  ·
                  {' '}
                  {formatNumber(unit.remaining_quantity)}
                  {' '}
                  {unit.uom}
                </span>
                <span className="badge">{unit.availability}</span>
                <small>{unit.supplier_barcode ?? unit.internal_code}</small>
              </Link>
            ))}
          </div>
        )}
      <Link href="/receiving/packages">{es ? 'Ver todos los paquetes' : 'Browse packages'}</Link>
    </section>
  );
}

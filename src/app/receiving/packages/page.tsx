import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import DirectoryToolbar from '@/components/directory-toolbar';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import loadSerializedUnits, { loadPackageFilterOptions } from '@/lib/receiving-data';
import { formatDate, formatNumber } from '@/domain/format';
import {
  hasPackageDirectoryCriteria, packageDirectoryHref, parsePackageDirectoryQuery,
  type PackageSearchParams,
} from './directory-query';

export const dynamic = 'force-dynamic';

export default async function Packages({
  searchParams,
}: {
  searchParams: Promise<PackageSearchParams>;
}) {
  const { db, profile } = await requireProfile();
  if (!(await hasPermission(db, 'inventory.read'))) redirect('/app');
  const query = parsePackageDirectoryQuery(await searchParams);
  const [units, options] = await Promise.all([
    loadSerializedUnits(db, {
      search_text: query.q,
      ingredient_filter: query.ingredient,
      supplier_filter: query.supplier,
      availability_filter: query.status,
      expiry_filter: query.expiry,
      balance_filter: query.balance,
      sort_order: query.sort,
    }),
    loadPackageFilterOptions(db),
  ]);
  const es = profile.preferred_locale === 'es';
  const directoryHref = packageDirectoryHref(query);
  const filters = [
    {
      key: 'ingredient',
      label: es ? 'Ingrediente' : 'Ingredient',
      options: options.ingredients.map(({ id, name }) => ({ value: id, label: name })),
    },
    {
      key: 'supplier',
      label: es ? 'Proveedor' : 'Supplier',
      options: options.suppliers.map(({ id, name }) => ({ value: id, label: name })),
    },
    {
      key: 'status',
      label: es ? 'Estado' : 'Status',
      options: [
        { value: 'Available', label: es ? 'Disponible' : 'Available' },
        { value: 'Hold', label: es ? 'En espera' : 'Hold' },
        { value: 'Quarantined', label: es ? 'En cuarentena' : 'Quarantined' },
        { value: 'Expired', label: es ? 'Vencido' : 'Expired' },
        { value: 'Exhausted', label: es ? 'Agotado' : 'Exhausted' },
      ],
    },
    {
      key: 'expiry',
      label: es ? 'Vencimiento' : 'Expiry',
      options: [
        { value: 'expired', label: es ? 'Vencido' : 'Expired' },
        { value: 'soon', label: es ? 'En 30 días' : 'Within 30 days' },
        { value: 'later', label: es ? 'Después de 30 días' : 'More than 30 days away' },
        { value: 'undated', label: es ? 'Sin fecha' : 'No expiry date' },
      ],
    },
    {
      key: 'balance',
      label: es ? 'Saldo' : 'Balance',
      options: [
        { value: 'positive', label: es ? 'Con saldo' : 'Remaining' },
        { value: 'partial', label: es ? 'Parcialmente usado' : 'Partially used' },
        { value: 'empty', label: es ? 'Sin saldo' : 'Empty' },
      ],
    },
  ];
  const sortOptions = [
    { value: 'newest', label: es ? 'Más recientes' : 'Newest first' },
    { value: 'oldest', label: es ? 'Más antiguos' : 'Oldest first' },
    { value: 'ingredient', label: es ? 'Ingrediente A–Z' : 'Ingredient A–Z' },
    { value: 'expiry', label: es ? 'Próximo vencimiento' : 'Soonest expiry' },
    { value: 'balance', label: es ? 'Menor saldo' : 'Lowest balance' },
  ];
  const filteredDescription = es
    ? 'Pruebe otra búsqueda o borre los filtros.' : 'Try another search or clear the filters.';
  const initialDescription = es
    ? 'Todavía no hay paquetes recibidos en esta instalación.'
    : 'There are no received packages in this facility yet.';
  const emptyDescription = hasPackageDirectoryCriteria(query)
    ? filteredDescription : initialDescription;
  const noExpiryLabel = es ? 'Sin fecha de vencimiento' : 'No expiry date';
  const expiryLabel = es ? 'Vence' : 'Expires';
  return (
    <main className="worker-page">
      <Link href="/receiving">{es ? '← Recepción' : '← Receiving'}</Link>
      <h1>{es ? 'Buscar un paquete' : 'Find a package'}</h1>
      <Suspense fallback={null}>
        <DirectoryToolbar
          label={es ? 'Filtros de paquetes' : 'Package filters'}
          resultCount={units.length}
          filters={filters}
          sortOptions={sortOptions}
          locale={profile.preferred_locale}
          mobileFilters
        />
      </Suspense>
      <p>
        {es ? 'Se muestran hasta 200 paquetes. Busque por código de barras, lote de origen o ingrediente.'
          : 'Showing up to 200 packages. Search by barcode, source lot, or ingredient.'}
      </p>
      {units.length === 0 && (
        <div className="empty" role="status">
          <h2>{es ? 'No se encontraron paquetes' : 'No matching packages'}</h2>
          <p>{emptyDescription}</p>
          {hasPackageDirectoryCriteria(query) ? (
            <Link href="/receiving/packages">{es ? 'Borrar todos los filtros' : 'Clear all filters'}</Link>
          ) : (
            <Link href="/receiving">{es ? 'Ir a recepción' : 'Go to receiving'}</Link>
          )}
        </div>
      )}
      <div className="serial-grid">
        {units.map((unit) => (
          <Link
            className="serial-card"
            key={unit.id}
            href={`/receiving/packages/${unit.id}?returnTo=${encodeURIComponent(directoryHref)}`}
          >
            <strong>{unit.ingredient_name}</strong>
            <span>
              {es ? 'Lote de origen' : 'Source lot'}
              {' '}
              {unit.source_lot || '—'}
              {' · '}
              {formatNumber(unit.remaining_quantity)}
              {' '}
              {unit.uom}
            </span>
            <span>{unit.supplier_name}</span>
            <span className="badge">{unit.availability}</span>
            <small>
              {unit.expiration_date
                ? `${expiryLabel} ${formatDate(unit.expiration_date)}`
                : noExpiryLabel}
            </small>
            <small>{unit.supplier_barcode ?? unit.internal_code}</small>
          </Link>
        ))}
      </div>
    </main>
  );
}

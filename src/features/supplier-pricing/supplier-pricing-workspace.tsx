'use client';

import Link from 'next/link';
import {
  CalendarClock, Check, ChevronRight, CircleDollarSign, Search,
} from 'lucide-react';
import {
  useActionState, useId, useMemo, useState,
} from 'react';
import ActionButton from '@/components/action-button';
import { formatDate, formatNumber } from '@/domain/format';
import { addSupplierPrice, initialSupplierPriceActionState } from './actions';
import type { SupplierPrice, SupplierPricingItem } from './domain';
import styles from './supplier-pricing.module.css';

interface SupplierPricingWorkspaceProps {
  items: SupplierPricingItem[];
  suppliers: { id: string; name: string }[];
  canRead: boolean;
  canWrite: boolean;
  currentDate: string;
  locale: 'en' | 'es';
}

type PriceFilter = 'all' | 'priced' | 'unpriced' | 'scheduled';
type StatusFilter = 'active' | 'all' | 'inactive';
const PRICE_FILTERS: PriceFilter[] = ['all', 'priced', 'unpriced', 'scheduled'];
const STATUS_FILTERS: StatusFilter[] = ['active', 'all', 'inactive'];

function money(value: number, locale: 'en' | 'es'): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(value);
}

function packLabel(item: SupplierPricingItem): string {
  return `${formatNumber(item.packQuantity)} ${item.packQuantityUom} / ${item.purchaseUom}`;
}

function displayedPrice(item: SupplierPricingItem, locale: 'en' | 'es'): string {
  if (item.currentPrice) return money(item.currentPrice.unit_price, locale);
  return locale === 'es' ? 'Sin precio' : 'Not priced';
}

function displayedPriceContext(item: SupplierPricingItem, locale: 'en' | 'es'): string {
  if (item.currentPrice) return locale === 'es' ? 'actual' : 'current';
  return locale === 'es' ? 'requiere precio' : 'needs price';
}

function historyStatus(
  price: SupplierPrice,
  item: SupplierPricingItem,
  currentDate: string,
  es: boolean,
): string {
  if (price.effective_on > currentDate) return es ? 'Programado' : 'Scheduled';
  if (item.currentPrice?.id === price.id) return es ? 'Actual' : 'Current';
  return es ? 'Anterior' : 'Previous';
}

function PriceHistory({
  item, currentDate, locale,
}: {
  item: SupplierPricingItem;
  currentDate: string;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  if (!item.prices.length) {
    return (
      <div className={styles.emptyHistory}>
        <CircleDollarSign aria-hidden="true" />
        <p>{es ? 'Todavía no hay historial de precios.' : 'No price history yet.'}</p>
      </div>
    );
  }
  return (
    <ol className={styles.history}>
      {item.prices.map((price) => {
        const status = historyStatus(price, item, currentDate, es);
        return (
          <li key={price.id} className={styles.historyRow}>
            <span className={styles.historyMarker} aria-hidden="true" />
            <div className={styles.historyBody}>
              <div className={styles.historyHeading}>
                <strong>{money(price.unit_price, locale)}</strong>
                <span className={status === (es ? 'Actual' : 'Current') ? styles.currentBadge : styles.historyBadge}>
                  {status}
                </span>
              </div>
              <p>
                {es ? 'Vigente desde' : 'Effective'}
                {' '}
                {formatDate(price.effective_on)}
                {' · '}
                {`${formatNumber(price.pack_quantity)} ${price.pack_quantity_uom} / ${price.purchase_uom}`}
              </p>
              {price.note ? <p className={styles.note}>{price.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PriceEditor({
  item, canWrite, currentDate, locale,
}: {
  item: SupplierPricingItem;
  canWrite: boolean;
  currentDate: string;
  locale: 'en' | 'es';
}) {
  const [state, action, pending] = useActionState(
    addSupplierPrice,
    initialSupplierPriceActionState,
  );
  const es = locale === 'es';
  const relevantFeedback = state.submittedItemId === item.id ? state : null;
  if (!canWrite) {
    return (
      <p className={styles.readOnly}>
        {es
          ? 'Tienes acceso de solo lectura. Un administrador puede agregar precios.'
          : 'You have view-only access. An administrator can add prices.'}
      </p>
    );
  }
  if (!item.active) {
    return (
      <p className={styles.readOnly}>
        {es
          ? 'Reactiva el ingrediente, proveedor y artículo para agregar un precio.'
          : 'Reactivate the ingredient, supplier, and item before adding a price.'}
      </p>
    );
  }
  return (
    <form
      action={action}
      className={styles.priceForm}
      key={`${item.id}-${relevantFeedback?.ok ? relevantFeedback.id : ''}`}
    >
      <input type="hidden" name="supplier_item_id" value={item.id} />
      <div className={styles.formHeading}>
        <div>
          <h4>{es ? 'Agregar nuevo precio' : 'Add a new price'}</h4>
          <p>
            {es
              ? 'Los cambios crean una nueva entrada; el historial nunca se sobrescribe.'
              : 'Changes create a new entry; price history is never overwritten.'}
          </p>
        </div>
        <CalendarClock aria-hidden="true" />
      </div>
      <div className={styles.formGrid}>
        <label>
          <span>{es ? 'Precio por unidad (USD)' : 'Price per purchase unit (USD)'}</span>
          <div className={styles.moneyField}>
            <span aria-hidden="true">$</span>
            <input
              name="unit_price"
              inputMode="decimal"
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              placeholder="0.00"
              required
            />
          </div>
          <small>{packLabel(item)}</small>
        </label>
        <label>
          <span>{es ? 'Fecha de vigencia' : 'Effective date'}</span>
          <input name="effective_on" type="date" defaultValue={currentDate} required />
          <small>{es ? 'Se permiten precios futuros.' : 'Future prices may be scheduled.'}</small>
        </label>
        <label className={styles.noteField}>
          <span>{es ? 'Nota (opcional)' : 'Note (optional)'}</span>
          <textarea
            name="note"
            maxLength={1000}
            rows={2}
            placeholder={es ? 'Motivo, cotización o contexto' : 'Reason, quote, or context'}
          />
        </label>
      </div>
      {relevantFeedback?.message ? (
        <p
          className={relevantFeedback.ok ? styles.success : styles.error}
          role={relevantFeedback.ok ? 'status' : 'alert'}
        >
          {relevantFeedback.ok ? <Check aria-hidden="true" /> : null}
          {relevantFeedback.message}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <ActionButton type="submit" pending={pending} pendingLabel={es ? 'Guardando…' : 'Saving…'}>
          {es ? 'Agregar precio' : 'Add price'}
        </ActionButton>
      </div>
    </form>
  );
}

export default function SupplierPricingWorkspace({
  items, suppliers, canRead, canWrite, currentDate, locale,
}: SupplierPricingWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const searchId = useId();
  const es = locale === 'es';
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return items.filter((item) => {
      const matchesText = !needle || [
        item.ingredientName, item.ingredientCode ?? '', item.supplierName, item.supplierSku,
      ].some((value) => value.toLocaleLowerCase(locale).includes(needle));
      const matchesSupplier = !supplierId || item.supplierId === supplierId;
      const matchesPrice = priceFilter === 'all'
        || (priceFilter === 'priced' && item.currentPrice !== null)
        || (priceFilter === 'unpriced' && item.currentPrice === null)
        || (priceFilter === 'scheduled' && item.nextPrice !== null);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && item.active)
        || (statusFilter === 'inactive' && !item.active);
      return matchesText && matchesSupplier && matchesPrice && matchesStatus;
    });
  }, [items, locale, priceFilter, query, statusFilter, supplierId]);
  const selectedItem = filteredItems.find((item) => item.id === selectedId)
    ?? filteredItems[0]
    ?? null;
  const criteriaApplied = Boolean(query || supplierId || priceFilter !== 'all'
    || statusFilter !== 'active');

  if (!canRead) {
    return (
      <section className={styles.permissionState}>
        <h3>{es ? 'Precios de proveedores no disponibles' : 'Supplier pricing unavailable'}</h3>
        <p>
          {es
            ? 'Solicita acceso a datos maestros para ver los costos de proveedores.'
            : 'Ask an administrator for master-data access to view supplier costs.'}
        </p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className={styles.emptyState}>
        <CircleDollarSign aria-hidden="true" />
        <h3>{es ? 'Configura un artículo de proveedor primero' : 'Set up a supplier item first'}</h3>
        <p>
          {es
            ? 'Conecta un ingrediente con un proveedor y su presentación antes de agregar precios.'
            : 'Connect an ingredient to a supplier and pack before adding prices.'}
        </p>
        <div>
          <Link className="button" href="/app/ingredients">
            {es ? 'Abrir ingredientes' : 'Open ingredients'}
          </Link>
          <Link className="button secondary" href="/app/suppliers">
            {es ? 'Abrir proveedores' : 'Open suppliers'}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace} aria-label={es ? 'Precios de proveedores' : 'Supplier pricing'}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>{es ? 'COSTOS DE INGREDIENTES' : 'INGREDIENT COSTS'}</p>
          <h2>{es ? 'Precios de proveedores' : 'Supplier pricing'}</h2>
          <p>
            {es
              ? 'Busca una presentación, consulta el precio vigente y agrega cambios con fecha.'
              : 'Find a supplier pack, review its current cost, and add effective-dated changes.'}
          </p>
        </div>
        <div className={styles.summary}>
          <strong>{items.filter((item) => item.currentPrice).length}</strong>
          <span>{es ? `de ${items.length} con precio` : `of ${items.length} priced`}</span>
        </div>
      </div>

      <div className={styles.filters}>
        <label className={styles.searchField} htmlFor={searchId}>
          <span>{es ? 'Buscar artículos' : 'Search items'}</span>
          <div>
            <Search aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={es ? 'Ingrediente, proveedor o SKU' : 'Ingredient, supplier, or SKU'}
            />
          </div>
        </label>
        <label>
          <span>{es ? 'Proveedor' : 'Supplier'}</span>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">{es ? 'Todos los proveedores' : 'All suppliers'}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{es ? 'Precio' : 'Pricing'}</span>
          <select
            value={priceFilter}
            onChange={(event) => {
              const nextFilter = PRICE_FILTERS.find((value) => value === event.target.value);
              if (nextFilter) setPriceFilter(nextFilter);
            }}
          >
            <option value="all">{es ? 'Todos' : 'All'}</option>
            <option value="priced">{es ? 'Con precio' : 'Priced'}</option>
            <option value="unpriced">{es ? 'Sin precio' : 'Needs price'}</option>
            <option value="scheduled">{es ? 'Programado' : 'Scheduled'}</option>
          </select>
        </label>
        <label>
          <span>{es ? 'Estado' : 'Status'}</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              const nextFilter = STATUS_FILTERS.find((value) => value === event.target.value);
              if (nextFilter) setStatusFilter(nextFilter);
            }}
          >
            <option value="active">{es ? 'Activos' : 'Active'}</option>
            <option value="all">{es ? 'Todos' : 'All'}</option>
            <option value="inactive">{es ? 'Inactivos' : 'Inactive'}</option>
          </select>
        </label>
        {criteriaApplied ? (
          <button
            className={styles.clearButton}
            type="button"
            onClick={() => {
              setQuery('');
              setSupplierId('');
              setPriceFilter('all');
              setStatusFilter('active');
            }}
          >
            {es ? 'Borrar filtros' : 'Clear filters'}
          </button>
        ) : null}
      </div>

      <div className={styles.resultBar} role="status" aria-live="polite">
        {es ? `${filteredItems.length} artículos` : `${filteredItems.length} items`}
      </div>

      {!filteredItems.length ? (
        <div className={styles.noMatches}>
          <h3>{es ? 'No hay artículos que coincidan' : 'No matching supplier items'}</h3>
          <p>{es ? 'Prueba otra búsqueda o borra los filtros.' : 'Try another search or clear the filters.'}</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSupplierId('');
              setPriceFilter('all');
              setStatusFilter('active');
            }}
          >
            {es ? 'Borrar filtros' : 'Clear filters'}
          </button>
        </div>
      ) : (
        <div className={styles.content}>
          <div className={styles.itemList} role="list" aria-label={es ? 'Artículos de proveedores' : 'Supplier items'}>
            {filteredItems.map((item) => {
              const selected = item.id === selectedItem?.id;
              return (
                <div key={item.id} role="listitem">
                  <button
                    type="button"
                    aria-pressed={selected}
                    className={selected ? styles.itemSelected : styles.item}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className={styles.itemMain}>
                      <strong>{item.ingredientName}</strong>
                      <span>
                        {item.supplierName}
                        {item.supplierSku ? ` · SKU ${item.supplierSku}` : ''}
                      </span>
                      <small>{packLabel(item)}</small>
                    </span>
                    <span className={styles.itemPrice}>
                      <strong>{displayedPrice(item, locale)}</strong>
                      <small>{displayedPriceContext(item, locale)}</small>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {selectedItem ? (
            <article className={styles.detail}>
              <header className={styles.detailHeader}>
                <div>
                  <div className={styles.detailBadges}>
                    {selectedItem.preferred ? <span>{es ? 'Preferido' : 'Preferred'}</span> : null}
                    {!selectedItem.active ? <span className={styles.inactiveBadge}>{es ? 'Inactivo' : 'Inactive'}</span> : null}
                  </div>
                  <h3>{selectedItem.ingredientName}</h3>
                  <p>
                    {selectedItem.supplierName}
                    {selectedItem.supplierSku ? ` · SKU ${selectedItem.supplierSku}` : ''}
                  </p>
                </div>
                <div className={styles.currentPrice}>
                  <span>{es ? 'Precio vigente' : 'Current price'}</span>
                  <strong>
                    {selectedItem.currentPrice
                      ? money(selectedItem.currentPrice.unit_price, locale)
                      : '—'}
                  </strong>
                  <small>{packLabel(selectedItem)}</small>
                </div>
              </header>
              {selectedItem.nextPrice ? (
                <div className={styles.scheduledNotice}>
                  <CalendarClock aria-hidden="true" />
                  <span>
                    {es ? 'Próximo precio' : 'Next price'}
                    :
                    {' '}
                    <strong>{money(selectedItem.nextPrice.unit_price, locale)}</strong>
                    {' '}
                    {es ? 'desde' : 'on'}
                    {' '}
                    {formatDate(selectedItem.nextPrice.effective_on)}
                  </span>
                </div>
              ) : null}
              <PriceEditor
                item={selectedItem}
                canWrite={canWrite}
                currentDate={currentDate}
                locale={locale}
              />
              <section className={styles.historySection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h4>{es ? 'Historial de precios' : 'Price history'}</h4>
                    <p>{es ? 'Más reciente primero; las entradas son inmutables.' : 'Newest first; entries are immutable.'}</p>
                  </div>
                  <span>{selectedItem.prices.length}</span>
                </div>
                <PriceHistory item={selectedItem} currentDate={currentDate} locale={locale} />
              </section>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

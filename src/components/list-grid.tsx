'use client';

import Link from 'next/link';
import { AG_GRID_LOCALE_ES } from '@ag-grid-community/locale';
import {
  useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import {
  ClientSideRowModelModule, LocaleModule, PaginationModule, QuickFilterModule,
  RenderApiModule, RowApiModule, RowAutoHeightModule, TextFilterModule,
  themeQuartz, type ColDef, type GridApi, type ICellRendererParams,
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import styles from './list-grid.module.css';

/** Display data only. Fetching, authorization, and server filters belong to the caller. */
export interface ListGridCell {
  text: string;
  href?: string;
  detailsId?: string;
  secondary?: string;
  badge?: 'default' | 'muted' | 'warning';
  sortValue?: string | number;
  slot?: string;
}

export interface ListGridRow {
  id: string;
  cells: Record<string, ListGridCell>;
}

export interface ListGridColumn {
  key: string;
  label: string;
  minWidth?: number;
  flex?: number;
  sortable?: boolean;
  filterable?: boolean;
}

export interface ListGridProps {
  label: string;
  columns: ListGridColumn[];
  rows: ListGridRow[];
  locale?: 'en' | 'es';
  pageSize?: number;
  cellSlots?: Record<string, ReactNode>;
  searchable?: boolean;
  loading?: boolean;
  emptyMessage?: string;
}

const modules = [
  ClientSideRowModelModule,
  LocaleModule,
  PaginationModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  RowAutoHeightModule,
  TextFilterModule,
];
const emptyCellSlots: Record<string, ReactNode> = {};
const subscribe = () => () => {};
const gridTheme = themeQuartz.withParams({
  accentColor: '#386443',
  backgroundColor: '#ffffff',
  borderColor: '#e4e9e1',
  fontFamily: 'inherit',
  foregroundColor: '#25372b',
  headerBackgroundColor: '#f6f8f4',
  headerTextColor: '#576b5c',
  oddRowBackgroundColor: '#fafbf8',
  spacing: 8,
});

function cellText(cell: ListGridCell | undefined): string {
  return cell?.text ?? '';
}

function cellContent(value: ListGridCell | undefined, cellSlots: Record<string, ReactNode>) {
  if (!value) return null;
  if (value.slot) return cellSlots[value.slot] ?? null;
  const content = value.badge
    ? <span className={`badge${value.badge === 'default' ? '' : ` ${value.badge}`}`}>{value.text}</span>
    : value.text;
  let main = content;
  if (value.href) main = <Link href={value.href}>{content}</Link>;
  if (value.detailsId) {
    main = (
      <a
        href={`#${value.detailsId}`}
        aria-controls={value.detailsId}
        onClick={() => {
          const target = document.getElementById(value.detailsId ?? '');
          if (target instanceof HTMLDetailsElement) target.open = true;
        }}
      >
        {content}
      </a>
    );
  }
  return (
    <span className={styles.cell}>
      {main}
      {value.secondary && <span className={styles.secondary}>{value.secondary}</span>}
    </span>
  );
}

function StaticTable({
  label, columns, rows, cellSlots, loading, emptyMessage, locale, pageSize = 20,
}: Pick<ListGridProps, 'label' | 'columns' | 'rows' | 'cellSlots' | 'loading' | 'emptyMessage' | 'locale' | 'pageSize'>) {
  let statusText = emptyMessage;
  if (loading) statusText = locale === 'es' ? 'Cargando…' : 'Loading…';
  const initialRows = rows.slice(0, pageSize);
  const pageSummary = locale === 'es'
    ? `Mostrando los primeros ${initialRows.length} de ${rows.length} registros.`
    : `Showing the first ${initialRows.length} of ${rows.length} records.`;
  return (
    <table className={styles.fallbackTable} aria-label={label} aria-busy={loading}>
      {!loading && rows.length > initialRows.length && (
        <caption className={styles.fallbackSummary}>{pageSummary}</caption>
      )}
      <thead><tr>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
      <tbody>
        {loading || rows.length === 0 ? (
          <tr>
            <td className={styles.fallbackEmpty} colSpan={Math.max(columns.length, 1)}>
              {statusText}
            </td>
          </tr>
        ) : initialRows.map((row) => (
          <tr key={row.id}>
            {columns.map((column) => (
              <td key={column.key}>{cellContent(row.cells[column.key], cellSlots ?? {})}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Client-side sorting, column filters, search, and pagination over caller-provided rows. */
export default function ListGrid({
  label, columns, rows, locale = 'en', pageSize = 20, cellSlots = emptyCellSlots,
  searchable = true, loading = false, emptyMessage = undefined,
}: ListGridProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const gridApiRef = useRef<GridApi<ListGridRow> | null>(null);
  const [search, setSearch] = useState('');
  const [displayedCount, setDisplayedCount] = useState<number | null>(null);
  const effectivePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;
  useEffect(() => {
    const api = gridApiRef.current;
    if (api && !api.isDestroyed()) api.setGridAriaProperty('label', label);
  }, [label]);
  const es = locale === 'es';
  const emptyText = emptyMessage ?? (es ? 'No hay registros para mostrar.' : 'No records to display.');
  const columnDefs = useMemo<ColDef<ListGridRow, ListGridCell>[]>(() => columns.map((column) => ({
    colId: column.key,
    headerName: column.label,
    minWidth: column.minWidth ?? 140,
    flex: column.flex ?? 1,
    sortable: column.sortable ?? true,
    filter: column.filterable === false ? false : 'agTextColumnFilter',
    valueGetter: (params) => params.data?.cells[column.key],
    filterValueGetter: (params) => cellText(params.data?.cells[column.key]),
    getQuickFilterText: (params) => cellText(params.value ?? undefined),
    comparator: (left, right) => {
      const a = left?.sortValue ?? cellText(left ?? undefined);
      const b = right?.sortValue ?? cellText(right ?? undefined);
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: 'base' });
    },
    cellRenderer: (params: ICellRendererParams<ListGridRow, ListGridCell>) => (
      cellContent(params.value ?? undefined, cellSlots)
    ),
    autoHeight: true,
    wrapText: true,
  })), [cellSlots, columns, locale]);

  const shown = displayedCount ?? rows.length;
  let countText = es ? `${rows.length} registros` : `${rows.length} records`;
  if (shown !== rows.length) {
    countText = es ? `${shown} de ${rows.length} registros` : `${shown} of ${rows.length} records`;
  }
  if (loading) countText = es ? 'Cargando…' : 'Loading…';
  let noResultsText = emptyText;
  if (rows.length > 0) {
    noResultsText = es
      ? 'No se encontraron resultados. Prueba otra búsqueda o filtro.'
      : 'No matching results. Try another search or filter.';
  }

  return (
    <div className={styles.wrap} role="region" aria-label={label} aria-busy={loading}>
      <div className={styles.toolbar}>
        <span className={styles.count} role="status" aria-live="polite">{countText}</span>
        {searchable && (
          <div className={styles.searchBox}>
            <span className={styles.searchIcon} aria-hidden="true" />
            <input
              className={styles.search}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={es ? 'Buscar en la tabla' : 'Search this table'}
              aria-label={es ? `Buscar en ${label}` : `Search ${label}`}
              disabled={loading}
            />
          </div>
        )}
      </div>
      <div className={styles.tableScroll}>
        {mounted ? (
          <AgGridProvider modules={modules}>
            <AgGridReact<ListGridRow>
              key={locale}
              columnDefs={columnDefs}
              domLayout="autoHeight"
              getRowId={(params) => params.data.id}
              headerHeight={44}
              loading={loading}
              localeText={es ? AG_GRID_LOCALE_ES : undefined}
              onGridReady={(event) => {
                gridApiRef.current = event.api;
                event.api.setGridAriaProperty('label', label);
              }}
              onGridPreDestroyed={() => {
                gridApiRef.current = null;
              }}
              onModelUpdated={(event) => setDisplayedCount(event.api.getDisplayedRowCount())}
              pagination={rows.length > effectivePageSize}
              paginationPageSize={effectivePageSize}
              paginationPageSizeSelector={false}
              quickFilterText={searchable ? search : ''}
              rowData={rows}
              suppressNoRowsOverlay
              theme={gridTheme}
            />
          </AgGridProvider>
        ) : (
          <StaticTable
            label={label}
            columns={columns}
            rows={rows}
            cellSlots={cellSlots}
            loading={loading}
            emptyMessage={emptyText}
            locale={locale}
            pageSize={effectivePageSize}
          />
        )}
      </div>
      {mounted && !loading && shown === 0 && (
        <p className={styles.empty} role="status">{noResultsText}</p>
      )}
    </div>
  );
}

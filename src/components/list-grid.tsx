'use client';

import Link from 'next/link';
import { AG_GRID_LOCALE_ES } from '@ag-grid-community/locale';
import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode,
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

/** In controlled mode the caller supplies one already filtered, sorted, and paged result page. */
export interface ListGridControlledState {
  page: number;
  pageSize: number;
  totalCount: number;
  sort?: { key: string; direction: 'asc' | 'desc' };
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
  focusRowId?: string;
  controlled?: ListGridControlledState;
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

interface FocusPageApi {
  getRowNode: (rowId: string) => { rowIndex: number | null } | undefined;
  paginationGetCurrentPage: () => number;
  paginationGoToPage: (page: number) => void;
}

/** Reveal a focused row on its sorted grid page before an owner restores DOM focus. */
export function revealFocusRowPage(api: FocusPageApi, rowId: string, pageSize: number): void {
  const rowIndex = api.getRowNode(rowId)?.rowIndex;
  if (rowIndex === null || rowIndex === undefined || rowIndex < 0) return;
  const targetPage = Math.floor(rowIndex / pageSize);
  if (api.paginationGetCurrentPage() !== targetPage) api.paginationGoToPage(targetPage);
}
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
  label, columns, rows, cellSlots, loading, emptyMessage, locale, pageSize = 20, controlled,
}: Pick<ListGridProps, 'label' | 'columns' | 'rows' | 'cellSlots' | 'loading' | 'emptyMessage' | 'locale' | 'pageSize' | 'controlled'>) {
  let statusText = emptyMessage;
  if (loading) statusText = locale === 'es' ? 'Cargando…' : 'Loading…';
  const initialRows = controlled ? rows : rows.slice(0, pageSize);
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

/** Client-side grid by default; controlled callers own the complete directory query. */
export default function ListGrid({
  label, columns, rows, locale = 'en', pageSize = 20, cellSlots = emptyCellSlots,
  searchable = true, loading = false, emptyMessage = undefined,
  focusRowId = undefined, controlled = undefined,
}: ListGridProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const descriptionId = useId();
  const gridApiRef = useRef<GridApi<ListGridRow> | null>(null);
  const [search, setSearch] = useState('');
  const [displayedCount, setDisplayedCount] = useState<number | null>(null);
  const effectivePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;
  const externallyControlled = controlled !== undefined;
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
    sortable: !externallyControlled && (column.sortable ?? true),
    filter: externallyControlled || column.filterable === false ? false : 'agTextColumnFilter',
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
  })), [cellSlots, columns, externallyControlled, locale]);

  const shown = externallyControlled ? rows.length : (displayedCount ?? rows.length);
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
  const controlledPage = controlled && Number.isSafeInteger(controlled.page) && controlled.page > 0
    ? controlled.page : 1;
  const controlledPageSize = controlled && Number.isSafeInteger(controlled.pageSize)
    && controlled.pageSize > 0 ? controlled.pageSize : effectivePageSize;
  const controlledTotal = controlled && Number.isSafeInteger(controlled.totalCount)
    && controlled.totalCount >= 0 ? controlled.totalCount : rows.length;
  const start = rows.length === 0 ? 0 : (controlledPage - 1) * controlledPageSize + 1;
  const end = rows.length === 0 ? 0 : start + rows.length - 1;
  const sortColumn = columns.find((column) => column.key === controlled?.sort?.key);
  let sortDescription = '';
  if (sortColumn && controlled?.sort) {
    let direction = es ? 'ascendente' : 'ascending';
    if (controlled.sort.direction === 'desc') direction = es ? 'descendente' : 'descending';
    sortDescription = `${es ? 'Ordenado por' : 'Sorted by'} ${sortColumn.label} ${direction}.`;
  }
  const pageDescription = `${es ? 'Página' : 'Page'} ${controlledPage}.`;
  const rangeDescription = `${es ? 'Mostrando' : 'Showing'} ${start}–${end} ${es ? 'de' : 'of'} ${controlledTotal} ${es ? 'registros' : 'records'}.`;
  const controlledDescription = externallyControlled
    ? `${pageDescription} ${rangeDescription} ${sortDescription}`.trim()
    : undefined;

  return (
    <div
      className={styles.wrap}
      role="region"
      aria-label={label}
      aria-describedby={externallyControlled ? descriptionId : undefined}
      aria-busy={loading}
    >
      {controlledDescription && (
        <span id={descriptionId} className={styles.visuallyHidden}>{controlledDescription}</span>
      )}
      {!externallyControlled && (
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
      )}
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
              onModelUpdated={(event) => {
                if (!externallyControlled) setDisplayedCount(event.api.getDisplayedRowCount());
                if (!focusRowId || externallyControlled) return;
                revealFocusRowPage(event.api, focusRowId, effectivePageSize);
              }}
              pagination={!externallyControlled && rows.length > effectivePageSize}
              paginationPageSize={effectivePageSize}
              paginationPageSizeSelector={false}
              quickFilterText={!externallyControlled && searchable ? search : ''}
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
            controlled={controlled}
          />
        )}
      </div>
      {mounted && !loading && shown === 0 && (
        <p className={styles.empty} role="status">{noResultsText}</p>
      )}
    </div>
  );
}

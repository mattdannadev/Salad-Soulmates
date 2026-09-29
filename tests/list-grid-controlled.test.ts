import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ListGrid, { type ListGridRow } from '../src/components/list-grid';

const rows: ListGridRow[] = [
  { id: '1', cells: { name: { text: 'Apple' } } },
  { id: '2', cells: { name: { text: 'Banana' } } },
  { id: '3', cells: { name: { text: 'Cherry' } } },
];
const columns = [{ key: 'name', label: 'Name' }];

describe('ListGrid controlled directory state', () => {
  it('renders every supplied page row without another search or pager', () => {
    const html = renderToStaticMarkup(createElement(ListGrid, {
      label: 'Fruit',
      columns,
      rows,
      pageSize: 2,
      controlled: {
        page: 2,
        pageSize: 20,
        totalCount: 53,
        sort: { key: 'name', direction: 'asc' },
      },
    }));
    expect(html).toContain('Apple');
    expect(html).toContain('Banana');
    expect(html).toContain('Cherry');
    expect(html).toContain('Page 2. Showing 21–23 of 53 records. Sorted by Name ascending.');
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('Showing the first');
  });

  it('keeps existing client-side fallback behavior for uncontrolled lists', () => {
    const html = renderToStaticMarkup(createElement(ListGrid, {
      label: 'Fruit',
      columns,
      rows,
      pageSize: 2,
    }));
    expect(html).toContain('Apple');
    expect(html).toContain('Banana');
    expect(html).not.toContain('Cherry');
    expect(html).toContain('type="search"');
    expect(html).toContain('Showing the first 2 of 3 records.');
  });

  it('localizes the controlled summary and respects a caller-provided empty message', () => {
    const html = renderToStaticMarkup(createElement(ListGrid, {
      label: 'Frutas',
      columns,
      rows: [],
      locale: 'es',
      emptyMessage: 'Sin coincidencias',
      controlled: { page: 1, pageSize: 20, totalCount: 0 },
    }));
    expect(html).toContain('Página 1. Mostrando 0–0 de 0 registros.');
    expect(html).toContain('Sin coincidencias');
    expect(html).not.toContain('type="search"');
  });
});

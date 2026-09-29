import { describe, expect, it } from 'vitest';
import {
  clearDirectoryQuery,
  parseDirectoryQuery,
  updateDirectoryQuery,
  type DirectoryQueryConfig,
} from '../src/components/directory-toolbar';

const config: DirectoryQueryConfig = {
  filters: [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
    {
      key: 'facility',
      label: 'Facility',
      options: [
        { value: 'north', label: 'North' },
      ],
    },
  ],
  sortOptions: [{ value: 'name_asc', label: 'Name A–Z' }],
};

describe('directory query contract', () => {
  it('parses configured search, filters, sort, and page', () => {
    expect(parseDirectoryQuery('q=%20salad%20&status=active&sort=name_asc&page=3', config)).toEqual({
      q: 'salad', filters: { status: 'active' }, sort: 'name_asc', page: 3,
    });
  });

  it('ignores malformed and unconfigured values', () => {
    expect(parseDirectoryQuery('q=a&q=b&status=deleted&facility=north&sort=unknown&page=0', config))
      .toEqual({
        q: '', filters: { facility: 'north' }, sort: '', page: 1,
      });
    expect(parseDirectoryQuery('status=active&status=inactive&page=99999999999999', config))
      .toEqual({
        q: '', filters: {}, sort: '', page: 1,
      });
  });

  it('preserves unrelated parameters when criteria change and resets page', () => {
    const next = updateDirectoryQuery(
      'returnTo=%2Fapp%2Forders%3Fstatus%3Dopen&tab=pricing&q=old&page=4&status=active',
      config,
      { q: 'new', filters: { status: 'inactive' } },
    );
    expect(next.get('returnTo')).toBe('/app/orders?status=open');
    expect(next.get('tab')).toBe('pricing');
    expect(next.get('q')).toBe('new');
    expect(next.get('status')).toBe('inactive');
    expect(next.has('page')).toBe(false);
  });

  it('updates only allowlisted filters and accepts valid page navigation', () => {
    const next = updateDirectoryQuery('unknown=keep&page=2', config, {
      filters: { unknown: 'discard', facility: 'north' },
    });
    expect(next.toString()).toBe('unknown=keep&facility=north');
    const paged = updateDirectoryQuery(next, config, { page: 5 });
    expect(paged.get('page')).toBe('5');
  });

  it('clears directory state while retaining unrelated context', () => {
    const next = clearDirectoryQuery(
      'q=salad&status=active&sort=name_asc&page=2&tab=history&returnTo=%2Fapp%2Forders',
      config,
    );
    expect(next.toString()).toBe('tab=history&returnTo=%2Fapp%2Forders');
  });
});

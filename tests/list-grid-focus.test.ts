import {
  describe, expect, it, vi,
} from 'vitest';
import { revealFocusRowPage } from '../src/components/list-grid';

describe('ListGrid focus restoration', () => {
  it('reveals the sorted page containing a returned row', () => {
    const paginationGoToPage = vi.fn();
    const api = {
      getRowNode: vi.fn(() => ({ rowIndex: 42 })),
      paginationGetCurrentPage: vi.fn(() => 0),
      paginationGoToPage,
    };
    revealFocusRowPage(api, 'user-42', 20);
    expect(api.getRowNode).toHaveBeenCalledWith('user-42');
    expect(paginationGoToPage).toHaveBeenCalledWith(2);
  });

  it('does not navigate again when the row is visible or absent', () => {
    const paginationGoToPage = vi.fn();
    const api = {
      getRowNode: vi.fn<() => { rowIndex: number | null } | undefined>(() => ({ rowIndex: 42 })),
      paginationGetCurrentPage: vi.fn(() => 2),
      paginationGoToPage,
    };
    revealFocusRowPage(api, 'user-42', 20);
    api.getRowNode.mockReturnValue(undefined);
    revealFocusRowPage(api, 'missing', 20);
    expect(paginationGoToPage).not.toHaveBeenCalled();
  });
});

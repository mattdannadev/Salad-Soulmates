import * as vitest from 'vitest';
import { stopListGridLinkPropagation } from '../src/components/list-grid';

vitest.describe('ListGrid link navigation', () => {
  vitest.it('isolates nested links from grid handlers without cancelling navigation', () => {
    const stopPropagation = vitest.vi.fn();
    const preventDefault = vitest.vi.fn();
    const event = { stopPropagation, preventDefault };

    stopListGridLinkPropagation(event);

    vitest.expect(stopPropagation).toHaveBeenCalledOnce();
    vitest.expect(preventDefault).not.toHaveBeenCalled();
  });
});

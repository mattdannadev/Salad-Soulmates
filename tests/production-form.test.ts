import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe, expect, it, vi,
} from 'vitest';
import ProductionForm from '../src/components/production-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../src/app/production-actions', () => ({ default: vi.fn() }));

describe('ProductionForm', () => {
  it('defaults a new plan to finish before customer pickup', () => {
    const html = renderToStaticMarkup(createElement(ProductionForm, {
      orderId: '10000000-0000-4000-8000-000000000621',
      dueDate: '2026-10-14',
      plan: undefined,
      locale: 'en',
    }));

    expect(html).toMatch(/type="date" required="" min="" max="2026-10-13" value="2026-10-13"/);
    expect(html).not.toContain('value="2026-10-14"');
  });
});

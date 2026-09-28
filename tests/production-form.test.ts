import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe, expect, it, vi,
} from 'vitest';
import ProductionForm from '../src/components/production-form';
import CustomerPickupDateForm from '../src/components/customer-pickup-date-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../src/app/production-actions', () => ({ default: vi.fn() }));
vi.mock('@/app/purchasing-actions', () => ({ default: vi.fn() }));

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

  it('allows dates after today when they remain before the pickup date', () => {
    const html = renderToStaticMarkup(createElement(ProductionForm, {
      orderId: '10000000-0000-4000-8000-000000000621',
      dueDate: '2026-10-14',
      plan: undefined,
      locale: 'en',
    }));

    expect(html).toContain('max="2026-10-13"');
    expect(html).not.toContain('max="2026-09-27"');
  });

  it('does not limit the corrected customer pickup date to today', () => {
    const html = renderToStaticMarkup(createElement(CustomerPickupDateForm, {
      orderId: '10000000-0000-4000-8000-000000000621',
      pickupDate: '2026-09-25',
      locale: 'en',
    }));

    expect(html).toContain('name="needed_on"');
    expect(html).not.toMatch(/name="needed_on"[^>]*max=/);
  });
});

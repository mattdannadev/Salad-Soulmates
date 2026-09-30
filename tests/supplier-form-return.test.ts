import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import type { Supplier } from '../src/domain/master-data';
import { SupplierForm } from '../src/components/master-forms';

const recordForm = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));

vi.mock('../src/components/record-form', () => ({ RecordForm: recordForm }));

const ingredientId = '00000000-0000-4000-8000-000000000100';

function renderedFormProps(returnHref: string) {
  renderToStaticMarkup(createElement(SupplierForm, { returnHref }));
  return recordForm.mock.lastCall?.[0];
}

describe('supplier form return behavior', () => {
  beforeEach(() => recordForm.mockClear());

  it('resumes ingredient pack setup after save or cancel without a supplier-row hash', () => {
    const href = `/app/ingredients/${ingredientId}?addPack=1`;
    expect(renderedFormProps(href)).toEqual(expect.objectContaining({
      afterSave: href,
      cancelHref: href,
      afterSaveRecordHashPrefix: undefined,
      replaceAfterSave: true,
    }));
  });

  it('offers purchasing-pack setup after creating from the directory and preserves the return', () => {
    expect(renderedFormProps('/app/suppliers?q=greens')).toEqual(expect.objectContaining({
      afterSave: '/app/suppliers/created?returnTo=%2Fapp%2Fsuppliers%3Fq%3Dgreens',
      cancelHref: '/app/suppliers?q=greens',
      afterSaveRecordHashPrefix: undefined,
    }));
  });

  it('keeps the existing supplier row focused after editing its details', () => {
    const supplier: Supplier = {
      id: '00000000-0000-4000-8000-000000000200',
      name: 'Jamie’s Spices',
      contact_name: 'Jamie',
      email: '',
      phone: '',
      lead_time_days: 0,
      active: true,
    };
    renderToStaticMarkup(createElement(SupplierForm, {
      supplier,
      returnHref: '/app/suppliers?q=spices',
    }));
    expect(recordForm.mock.lastCall?.[0]).toEqual(expect.objectContaining({
      afterSave: '/app/suppliers?q=spices',
      cancelHref: `/app/suppliers?q=spices#supplier-${supplier.id}`,
      afterSaveRecordHashPrefix: 'supplier-',
    }));
  });

  it('returns to Home after save or cancel without a supplier-row hash', () => {
    expect(renderedFormProps('/app')).toEqual(expect.objectContaining({
      afterSave: '/app',
      cancelHref: '/app',
      afterSaveRecordHashPrefix: undefined,
      replaceAfterSave: true,
    }));
  });

  it('uses the supplier directory when handed an external return', () => {
    expect(renderedFormProps('https://evil.example')).toEqual(expect.objectContaining({
      afterSave: '/app/suppliers/created?returnTo=%2Fapp%2Fsuppliers',
      cancelHref: '/app/suppliers',
      afterSaveRecordHashPrefix: undefined,
    }));
  });
});

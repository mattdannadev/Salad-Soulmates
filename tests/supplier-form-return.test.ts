import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
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

  it('still focuses a new supplier row when returning to the directory', () => {
    expect(renderedFormProps('/app/suppliers?q=greens')).toEqual(expect.objectContaining({
      afterSave: '/app/suppliers?q=greens',
      cancelHref: '/app/suppliers?q=greens',
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
      afterSave: '/app/suppliers',
      cancelHref: '/app/suppliers',
      afterSaveRecordHashPrefix: 'supplier-',
    }));
  });
});

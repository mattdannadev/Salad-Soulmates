import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import ReceiptHistory from '@/components/receipt-history';
import type {
  Ingredient, Receipt, ReceiptLine, Supplier,
} from '@/domain/master-data';

vi.mock('server-only', () => ({}));

const id = (value: number) => (
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
);
const receipt: Receipt = {
  id: id(1),
  supplier_id: id(2),
  received_on: '2026-09-21',
  supplier_reference: 'DELIVERY',
  note: '',
  created_at: '2026-09-21T12:00:00Z',
};
const line: ReceiptLine = {
  id: id(3),
  receipt_id: receipt.id,
  purchase_draft_line_id: null,
  ingredient_id: id(4),
  quantity: 5,
  uom: 'lb',
  supplier_lot: '',
  assigned_source_lot: null,
  source_lot_origin: null,
  expiration_date: null,
};
const ingredient: Ingredient = {
  id: line.ingredient_id,
  name: 'Garlic',
  category: 'Dry',
  default_uom: 'lb',
  active: true,
  description: '',
  storage_notes: '',
  traceability_mode: 'future_required',
  reorder_point: null,
  par_level: null,
  reorder_quantity: null,
};
const supplier: Supplier = {
  id: receipt.supplier_id,
  name: 'Supplier',
  contact_name: '',
  email: '',
  phone: '',
  lead_time_days: 0,
  active: true,
};

it('links labels only after at least one receipt line has a physical allocation', () => {
  const props = {
    receipts: [receipt],
    lines: [line],
    ingredients: [ingredient],
    suppliers: [supplier],
  };
  const pending = renderToStaticMarkup(createElement(ReceiptHistory, props));
  expect(pending).toContain('Labels pending');
  expect(pending).not.toContain(`/receiving/labels?receipt=${receipt.id}`);

  const allocated = renderToStaticMarkup(createElement(ReceiptHistory, {
    ...props,
    serializedReceiptLineIds: [line.id],
  }));
  expect(allocated).toContain(`/receiving/labels?receipt=${receipt.id}`);
});

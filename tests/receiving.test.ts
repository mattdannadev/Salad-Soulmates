import { expect, it } from 'vitest';
import {
  parsePackageLines,
  serializedReceiptSchema,
  serializedUnitSchema,
  unitChangeSchema,
} from '@/domain/receiving';

it('parses uneven physical packages while retaining unique supplier barcodes', () => {
  expect(parsePackageLines('30 | PACKAGE-1\n20')).toEqual([
    { quantity: 30, supplier_barcode: 'PACKAGE-1' },
    { quantity: 20, supplier_barcode: '' },
  ]);
});
it.each(['', '0', '-1', 'NaN', '1.00001', '20 | SAME\n30 | SAME', '25 | SSU-FORGED', '25 | A | B'])(
  'rejects invalid package entry %s',
  (input) => {
    expect(() => parsePackageLines(input)).toThrow();
  },
);
it('requires exact package totals and rejects invalid balance precision', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const receipt = {
    supplier_id: id,
    ingredient_id: id,
    request_id: id,
    quantity: 50,
    uom: 'lb',
    received_on: '2026-09-20',
    supplier_reference: '',
    supplier_lot: 'LOT',
    expiration_date: '',
    note: '',
    packages: [{ quantity: 49, supplier_barcode: '' }],
  };
  expect(serializedReceiptSchema.safeParse(receipt).success).toBe(false);
  expect(
    serializedReceiptSchema.safeParse({
      ...receipt,
      quantity: 0.3,
      packages: [{ quantity: 0.1 }, { quantity: 0.2 }],
    }).success,
  ).toBe(true);
  expect(
    unitChangeSchema.safeParse({
      id,
      unit_id: id,
      expected_revision: 0,
      remaining_quantity: 0.00001,
      status: 'Available',
      reason: 'Correction',
    }).success,
  ).toBe(false);
});

it('preserves an explicit source-lot origin on serialized-package reads', () => {
  const unit = {
    id: '00000000-0000-4000-8000-000000000001',
    receipt_id: '00000000-0000-4000-8000-000000000001',
    receipt_line_id: '00000000-0000-4000-8000-000000000001',
    ingredient_id: '00000000-0000-4000-8000-000000000001',
    ingredient_name: 'Garlic',
    supplier_name: 'Supplier',
    supplier_reference: '',
    received_on: '2026-09-20',
    initial_quantity: 1,
    remaining_quantity: 1,
    internal_code: 'SSU-00000000-0000-4000-8000-000000000001',
    supplier_barcode: null,
    supplier_lot: '',
    assigned_source_lot: 'SL-26263-0001',
    source_lot: 'SL-26263-0001',
    source_lot_origin: 'salad_soulmates_assigned',
    expiration_date: null,
    uom: 'lb',
    status: 'Available',
    availability: 'Available',
    revision: 0,
  };
  expect(serializedUnitSchema.parse(unit)).toMatchObject({
    source_lot: unit.assigned_source_lot,
    source_lot_origin: 'salad_soulmates_assigned',
  });
});

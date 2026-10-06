import { describe, expect, it } from 'vitest';
import { selectableUoms } from '@/services/uoms';

describe('selectableUoms', () => {
  const units = [
    { code: 'kg', measurement_system: 'metric' as const },
    { code: 'lb', measurement_system: 'imperial' as const },
    { code: 'each', measurement_system: 'universal' as const },
  ];

  it('offers metric and universal units to metric organizations', () => {
    expect(selectableUoms(units, 'metric').map((unit) => unit.code)).toEqual(['kg', 'each']);
  });

  it('offers imperial and universal units to imperial organizations', () => {
    expect(selectableUoms(units, 'imperial').map((unit) => unit.code)).toEqual(['lb', 'each']);
  });
});

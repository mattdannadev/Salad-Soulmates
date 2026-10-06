import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  readOrganizationMeasurementSystem,
  type MeasurementSystem,
} from '@/data/uoms';

interface MeasurementUnit {
  measurement_system: MeasurementSystem | 'universal';
}

export function selectableUoms<T extends MeasurementUnit>(
  units: T[],
  measurementSystem: MeasurementSystem,
): T[] {
  return units.filter((unit) => unit.measurement_system === 'universal'
    || unit.measurement_system === measurementSystem);
}

export async function organizationMeasurementSystem(
  db: SupabaseClient<Database>,
): Promise<MeasurementSystem> {
  return readOrganizationMeasurementSystem(db);
}

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { readOrganizationMeasurementSystem } from '@/data/uoms';
import type { MeasurementSystem } from '@/domain/uoms';
import type { Database } from '@/lib/database.types';

export { selectableUoms } from '@/domain/uoms';
export type { MeasurementSystem } from '@/domain/uoms';

export async function organizationMeasurementSystem(
  db: SupabaseClient<Database>,
): Promise<MeasurementSystem> {
  return readOrganizationMeasurementSystem(db);
}

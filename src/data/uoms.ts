import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { MeasurementSystem } from '@/domain/uoms';
import { readResult } from '@/lib/data';
import type { Database } from '@/lib/database.types';

export type { MeasurementSystem } from '@/domain/uoms';

export async function readOrganizationMeasurementSystem(
  db: SupabaseClient<Database>,
): Promise<MeasurementSystem> {
  const result = await db.from('organizations').select('measurement_system').single();
  return readResult(
    result,
    z.object({ measurement_system: z.enum(['metric', 'imperial']) }),
    'organization_measurement_system',
  ).measurement_system;
}

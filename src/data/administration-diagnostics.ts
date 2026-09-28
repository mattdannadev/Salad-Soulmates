import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readResult } from '@/lib/data';
import type { Database } from '@/lib/database.types';
import { operationError } from '@/lib/operation-error';

export const tenantSetupStatusSchema = z.object({
  organizationName: z.string().min(1),
  organizationStatus: z.enum(['active', 'suspended']),
  facilityName: z.string().min(1),
  facilityTimezone: z.string().min(1),
  activeUserCount: z.number().int().nonnegative(),
  activeAccessProfileCount: z.number().int().nonnegative(),
});

export const applicationErrorDiagnosticSchema = z.object({
  id: z.uuid(),
  operation: z.string().min(1).max(120),
  errorCode: z.string().min(1).max(80),
  severity: z.enum(['warning', 'error', 'critical']),
  safeMessage: z.string().min(1).max(500),
  route: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
});

export const loginEventDiagnosticSchema = z.object({
  id: z.uuid(),
  eventType: z.enum(['signed_in', 'signed_out']),
  occurredAt: z.iso.datetime({ offset: true }),
});

export interface AdministrationDiagnosticScope {
  organizationId: string;
  facilityId: string;
}

export interface RecentErrorFilter {
  limit: number;
  severity?: 'warning' | 'error' | 'critical';
}

export interface LoginEventFilter {
  limit: number;
  eventType?: 'signed_in' | 'signed_out';
}

export interface AdministrationDiagnosticsRepository {
  loadTenantSetupStatus(scope: AdministrationDiagnosticScope):
  Promise<z.infer<typeof tenantSetupStatusSchema>>;
  loadRecentErrors(scope: AdministrationDiagnosticScope, filter: RecentErrorFilter):
  Promise<z.infer<typeof applicationErrorDiagnosticSchema>[]>;
  loadLoginEvents(scope: AdministrationDiagnosticScope, filter: LoginEventFilter):
  Promise<z.infer<typeof loginEventDiagnosticSchema>[]>;
}

function exactCount(
  result: { count: number | null; error: unknown },
  operation: string,
): number {
  if (result.error) {
    throw operationError(operation, 'Unable to load the requested setup count.', result.error);
  }
  return z.number().int().nonnegative().parse(result.count);
}

/** Tenant-scoped reads for the allowlisted administration diagnostic tools. */
export default function createAdministrationDiagnosticsRepository(
  db: SupabaseClient<Database>,
): AdministrationDiagnosticsRepository {
  return {
    async loadTenantSetupStatus(scope) {
      const setupResults = await Promise.all([
        db.from('organizations').select('name,status')
          .eq('id', scope.organizationId).single(),
        db.from('facilities').select('name,timezone')
          .eq('organization_id', scope.organizationId)
          .eq('id', scope.facilityId)
          .single(),
        db.from('profiles').select('id', { count: 'exact', head: true })
          .eq('organization_id', scope.organizationId)
          .eq('active', true),
        db.from('access_profiles').select('id', { count: 'exact', head: true })
          .eq('organization_id', scope.organizationId)
          .eq('active', true),
      ]);
      const [
        organizationResult,
        facilityResult,
        userCountResult,
        accessProfileCountResult,
      ] = setupResults;
      const organization = readResult(
        organizationResult,
        z.object({ name: z.string().min(1), status: z.enum(['active', 'suspended']) }),
        'administration_diagnostics.organization',
      );
      const facility = readResult(
        facilityResult,
        z.object({ name: z.string().min(1), timezone: z.string().min(1) }),
        'administration_diagnostics.facility',
      );
      return tenantSetupStatusSchema.parse({
        organizationName: organization.name,
        organizationStatus: organization.status,
        facilityName: facility.name,
        facilityTimezone: facility.timezone,
        activeUserCount: exactCount(
          userCountResult,
          'administration_diagnostics.active_users',
        ),
        activeAccessProfileCount: exactCount(
          accessProfileCountResult,
          'administration_diagnostics.active_access_profiles',
        ),
      });
    },

    async loadRecentErrors(scope, filter) {
      let query = db.from('application_error_logs')
        .select('id,operation,error_code,severity,safe_message,route,occurred_at')
        .eq('organization_id', scope.organizationId)
        .order('occurred_at', { ascending: false })
        .limit(filter.limit);
      if (filter.severity) query = query.eq('severity', filter.severity);
      const rows = readResult(
        await query,
        z.array(z.object({
          id: z.uuid(),
          operation: z.string().min(1).max(120),
          error_code: z.string().min(1).max(80),
          severity: z.enum(['warning', 'error', 'critical']),
          safe_message: z.string().min(1).max(500),
          route: z.string().nullable(),
          occurred_at: z.iso.datetime({ offset: true }),
        })),
        'administration_diagnostics.errors',
      );
      return rows.map((row) => applicationErrorDiagnosticSchema.parse({
        id: row.id,
        operation: row.operation,
        errorCode: row.error_code,
        severity: row.severity,
        safeMessage: row.safe_message,
        route: row.route,
        occurredAt: row.occurred_at,
      }));
    },

    async loadLoginEvents(scope, filter) {
      let query = db.from('login_events')
        .select('id,event_type,occurred_at')
        .eq('organization_id', scope.organizationId)
        .order('occurred_at', { ascending: false })
        .limit(filter.limit);
      if (filter.eventType) query = query.eq('event_type', filter.eventType);
      const rows = readResult(
        await query,
        z.array(z.object({
          id: z.uuid(),
          event_type: z.enum(['signed_in', 'signed_out']),
          occurred_at: z.iso.datetime({ offset: true }),
        })),
        'administration_diagnostics.login_events',
      );
      return rows.map((row) => loginEventDiagnosticSchema.parse({
        id: row.id,
        eventType: row.event_type,
        occurredAt: row.occurred_at,
      }));
    },
  };
}

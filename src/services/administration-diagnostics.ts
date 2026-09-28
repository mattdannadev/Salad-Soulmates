import 'server-only';
import { z } from 'zod';
import createAdministrationDiagnosticsRepository, {
  applicationErrorDiagnosticSchema,
  type AdministrationDiagnosticsRepository,
  loginEventDiagnosticSchema,
  tenantSetupStatusSchema,
} from '@/data/administration-diagnostics';
import { requireAdminShell, resolveApiAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import isOperationsCopilotEnabled from '@/services/operations-copilot-entitlement';

const MAX_DIAGNOSTIC_ROWS = 25;
const DEFAULT_DIAGNOSTIC_ROWS = 10;

const tenantSetupRequestSchema = z.object({
  intent: z.literal('tenant_setup_status'),
}).strict();
const recentErrorsRequestSchema = z.object({
  intent: z.literal('recent_errors'),
  limit: z.number().int().min(1).max(MAX_DIAGNOSTIC_ROWS)
    .default(DEFAULT_DIAGNOSTIC_ROWS),
  severity: z.enum(['warning', 'error', 'critical']).optional(),
}).strict();
const loginEventsRequestSchema = z.object({
  intent: z.literal('login_events'),
  limit: z.number().int().min(1).max(MAX_DIAGNOSTIC_ROWS)
    .default(DEFAULT_DIAGNOSTIC_ROWS),
  eventType: z.enum(['signed_in', 'signed_out']).optional(),
}).strict();

export const administrationDiagnosticRequestSchema = z.discriminatedUnion('intent', [
  tenantSetupRequestSchema,
  recentErrorsRequestSchema,
  loginEventsRequestSchema,
]);

const setupResultSchema = z.array(tenantSetupStatusSchema).max(1);
const errorResultSchema = z.array(applicationErrorDiagnosticSchema).max(MAX_DIAGNOSTIC_ROWS);
const loginResultSchema = z.array(loginEventDiagnosticSchema).max(MAX_DIAGNOSTIC_ROWS);

export const administrationDiagnosticTools = {
  tenant_setup_status: {
    id: 'tenant_setup_status',
    permission: 'access.manage',
    scope: 'organization_and_active_facility',
    source: '/app/user-management/users',
    classification: 'read' as const,
    maxRows: 1,
    inputSchema: tenantSetupRequestSchema,
    outputSchema: setupResultSchema,
  },
  recent_errors: {
    id: 'recent_errors',
    permission: 'audit.read',
    scope: 'organization',
    source: null,
    classification: 'read' as const,
    maxRows: MAX_DIAGNOSTIC_ROWS,
    inputSchema: recentErrorsRequestSchema,
    outputSchema: errorResultSchema,
  },
  login_events: {
    id: 'login_events',
    permission: 'audit.read',
    scope: 'organization',
    source: '/app/user-management/login-history',
    classification: 'read' as const,
    maxRows: MAX_DIAGNOSTIC_ROWS,
    inputSchema: loginEventsRequestSchema,
    outputSchema: loginResultSchema,
  },
} as const;

interface AdministrationDiagnosticContext {
  enabled: boolean;
  organizationId: string;
  facilityId: string;
  repository: AdministrationDiagnosticsRepository;
  hasPermission(permission: string): Promise<boolean>;
}

export interface AdministrationDiagnosticDependencies {
  resolveContext(): Promise<AdministrationDiagnosticContext>;
}

const defaultDependencies: AdministrationDiagnosticDependencies = {
  async resolveContext() {
    const { db, profile } = await requireAdminShell();
    return {
      enabled: await isOperationsCopilotEnabled(),
      organizationId: profile.organization_id,
      facilityId: profile.facility_id,
      repository: createAdministrationDiagnosticsRepository(db),
      hasPermission: (permission) => hasPermission(db, permission),
    };
  },
};

function invalidRequest(input: unknown) {
  const intent = input && typeof input === 'object' && 'intent' in input
    ? String(input.intent) : undefined;
  const supported = Object.hasOwn(administrationDiagnosticTools, intent ?? '');
  return {
    ok: false as const,
    code: supported ? 'invalid' as const : 'unsupported' as const,
    error: 'Choose tenant_setup_status, recent_errors, or login_events with valid filters.',
  };
}

/** Executes one fixed, bounded diagnostic read without invoking an AI provider. */
export default async function runAdministrationDiagnostic(
  input: unknown,
  dependencies: AdministrationDiagnosticDependencies = defaultDependencies,
) {
  const parsed = administrationDiagnosticRequestSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(input);

  const context = await dependencies.resolveContext();
  if (!context.enabled) {
    return {
      ok: false as const,
      code: 'denied' as const,
      error: 'Administration diagnostics are not enabled for your access profile.',
    };
  }

  const tool = administrationDiagnosticTools[parsed.data.intent];
  if (!await context.hasPermission(tool.permission)) {
    return {
      ok: false as const,
      code: 'denied' as const,
      error: 'You do not have access to this administration diagnostic.',
    };
  }

  const scope = {
    organizationId: context.organizationId,
    facilityId: context.facilityId,
  };
  let records: unknown;
  if (parsed.data.intent === 'tenant_setup_status') {
    records = [await context.repository.loadTenantSetupStatus(scope)];
  } else if (parsed.data.intent === 'recent_errors') {
    records = await context.repository.loadRecentErrors(scope, parsed.data);
  } else {
    records = await context.repository.loadLoginEvents(scope, parsed.data);
  }
  const validatedRecords = tool.outputSchema.parse(records);
  return {
    ok: true as const,
    toolId: tool.id,
    classification: tool.classification,
    source: tool.source,
    scope: tool.scope,
    count: validatedRecords.length,
    records: validatedRecords,
  };
}

/** Executes a diagnostic with API-safe JSON authentication outcomes. */
export async function runAdministrationDiagnosticForApi(input: unknown) {
  const auth = await resolveApiAdminShell();
  if (!auth.ok) {
    let code: 'unauthenticated' | 'denied' | 'unavailable' = 'denied';
    if (auth.status === 401) code = 'unauthenticated';
    if (auth.status === 503) code = 'unavailable';
    return { ok: false as const, code, error: auth.error };
  }
  return runAdministrationDiagnostic(input, {
    async resolveContext() {
      return {
        enabled: await isOperationsCopilotEnabled(),
        organizationId: auth.profile.organization_id,
        facilityId: auth.profile.facility_id,
        repository: createAdministrationDiagnosticsRepository(auth.db),
        hasPermission: (permission) => hasPermission(auth.db, permission),
      };
    },
  });
}

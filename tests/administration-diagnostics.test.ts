import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import type { AdministrationDiagnosticsRepository } from '@/data/administration-diagnostics';
import runAdministrationDiagnostic, {
  administrationDiagnosticTools,
  type AdministrationDiagnosticDependencies,
} from '@/services/administration-diagnostics';

vi.mock('server-only', () => ({}));

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const FACILITY_ID = '00000000-0000-4000-8000-000000000002';
const ERROR_ID = '00000000-0000-4000-8000-000000000003';
const EVENT_ID = '00000000-0000-4000-8000-000000000004';

const repository = {
  loadTenantSetupStatus: vi.fn(),
  loadRecentErrors: vi.fn(),
  loadLoginEvents: vi.fn(),
} satisfies AdministrationDiagnosticsRepository;
const permission = vi.fn();
const resolveContext = vi.fn();
const dependencies: AdministrationDiagnosticDependencies = { resolveContext };

beforeEach(() => {
  vi.clearAllMocks();
  permission.mockResolvedValue(true);
  resolveContext.mockResolvedValue({
    enabled: true,
    organizationId: ORGANIZATION_ID,
    facilityId: FACILITY_ID,
    repository,
    hasPermission: permission,
  });
});

describe('administration diagnostics registry', () => {
  it('exposes only fixed read tools with explicit bounds and permissions', () => {
    expect(Object.keys(administrationDiagnosticTools)).toEqual([
      'tenant_setup_status',
      'recent_errors',
      'login_events',
    ]);
    expect(Object.values(administrationDiagnosticTools).every(
      (tool) => tool.classification === 'read' && tool.maxRows <= 25
        && tool.permission.length > 0,
    )).toBe(true);
  });

  it('rejects arbitrary tools and client-supplied tenant scope before authentication', async () => {
    await expect(runAdministrationDiagnostic({ intent: 'sql', query: 'select *' }, dependencies))
      .resolves.toMatchObject({ ok: false, code: 'unsupported' });
    await expect(runAdministrationDiagnostic({
      intent: 'recent_errors',
      organizationId: '00000000-0000-4000-8000-000000000099',
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'invalid' });
    expect(resolveContext).not.toHaveBeenCalled();
  });

  it('fails closed when the module or permission is unavailable', async () => {
    resolveContext.mockResolvedValueOnce({
      enabled: false,
      organizationId: ORGANIZATION_ID,
      facilityId: FACILITY_ID,
      repository,
      hasPermission: permission,
    });
    await expect(runAdministrationDiagnostic({ intent: 'login_events' }, dependencies))
      .resolves.toMatchObject({ ok: false, code: 'denied' });
    expect(permission).not.toHaveBeenCalled();
    expect(repository.loadLoginEvents).not.toHaveBeenCalled();

    permission.mockResolvedValueOnce(false);
    await expect(runAdministrationDiagnostic({ intent: 'recent_errors' }, dependencies))
      .resolves.toMatchObject({ ok: false, code: 'denied' });
    expect(repository.loadRecentErrors).not.toHaveBeenCalled();
  });

  it('uses server-derived tenant scope and bounded defaults for safe error records', async () => {
    repository.loadRecentErrors.mockResolvedValueOnce([{
      id: ERROR_ID,
      operation: 'settings.load',
      errorCode: 'READ_FAILED',
      severity: 'error',
      safeMessage: 'Settings data could not be loaded.',
      route: '/app/settings',
      occurredAt: '2026-09-27T12:00:00.000Z',
    }]);
    const result = await runAdministrationDiagnostic({ intent: 'recent_errors' }, dependencies);
    expect(permission).toHaveBeenCalledWith('audit.read');
    expect(repository.loadRecentErrors).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      facilityId: FACILITY_ID,
    }, { intent: 'recent_errors', limit: 10 });
    expect(result).toMatchObject({
      ok: true,
      toolId: 'recent_errors',
      classification: 'read',
      count: 1,
    });
  });

  it('enforces request and output row ceilings', async () => {
    await expect(runAdministrationDiagnostic({
      intent: 'login_events',
      limit: 26,
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'invalid' });
    expect(resolveContext).not.toHaveBeenCalled();

    repository.loadLoginEvents.mockResolvedValueOnce(Array.from({ length: 26 }, (_, index) => ({
      id: index === 0 ? EVENT_ID : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      eventType: 'signed_in' as const,
      occurredAt: '2026-09-27T12:00:00.000Z',
    })));
    await expect(runAdministrationDiagnostic({
      intent: 'login_events',
      limit: 25,
    }, dependencies)).rejects.toThrow();
  });

  it('returns a single customer-readable setup summary', async () => {
    repository.loadTenantSetupStatus.mockResolvedValueOnce({
      organizationName: 'Salad Soulmates',
      organizationStatus: 'active',
      facilityName: 'Main facility',
      facilityTimezone: 'America/Chicago',
      activeUserCount: 4,
      activeAccessProfileCount: 3,
    });
    const result = await runAdministrationDiagnostic(
      { intent: 'tenant_setup_status' },
      dependencies,
    );
    expect(permission).toHaveBeenCalledWith('access.manage');
    expect(result).toMatchObject({
      ok: true,
      toolId: 'tenant_setup_status',
      count: 1,
      records: [{ activeUserCount: 4, activeAccessProfileCount: 3 }],
    });
  });
});

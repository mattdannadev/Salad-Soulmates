import 'server-only';
import { randomUUID } from 'node:crypto';

const DIAGNOSTIC_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const ROUTE_PATH = /^\/[A-Za-z0-9_./-]*$/;
const MAX_OPERATION_LENGTH = 120;
const MAX_CODE_LENGTH = 80;
const MAX_NAME_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 500;
const MAX_ROUTE_LENGTH = 500;
const MAX_CORRELATION_LENGTH = 120;

type ErrorSeverity = 'warning' | 'error' | 'critical';

export interface ApplicationErrorReport {
  cause?: unknown;
  code?: string;
  message: string;
  operation: string;
  requestId?: string;
  route?: string;
  severity?: ErrorSeverity;
}

export interface ApplicationErrorReference {
  code: string;
  errorId: string;
}

function safeIdentifier(
  value: unknown,
  fallback: string,
  maximumLength: number,
  pattern = DIAGNOSTIC_IDENTIFIER,
) {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return candidate.length <= maximumLength && pattern.test(candidate) ? candidate : fallback;
}

function errorCode(report: ApplicationErrorReport) {
  if (report.code !== undefined) {
    return safeIdentifier(report.code, 'UNEXPECTED_FAILURE', MAX_CODE_LENGTH);
  }
  if (typeof report.cause === 'object' && report.cause !== null && 'code' in report.cause) {
    return safeIdentifier(report.cause.code, 'UNEXPECTED_FAILURE', MAX_CODE_LENGTH);
  }
  return 'UNEXPECTED_FAILURE';
}

function errorName(cause: unknown) {
  if (cause instanceof Error) {
    return safeIdentifier(cause.name, 'Error', MAX_NAME_LENGTH, ERROR_NAME);
  }
  return 'UnknownError';
}

function safeMessage(message: string) {
  const candidate = message.trim();
  return candidate.length > 0
    ? candidate.slice(0, MAX_MESSAGE_LENGTH)
    : 'The operation failed unexpectedly.';
}

function optionalIdentifier(value: string | undefined, maximumLength: number) {
  if (value === undefined) return null;
  const candidate = safeIdentifier(value, '', maximumLength);
  return candidate || null;
}

function safeRoute(route: string | undefined) {
  if (route === undefined) return null;
  const candidate = route.trim();
  return candidate.length <= MAX_ROUTE_LENGTH && ROUTE_PATH.test(candidate) ? candidate : null;
}

/**
 * Emit a searchable server diagnostic and best-effort tenant-scoped database record.
 * `message` must be a deliberately safe operational summary; raw exception messages,
 * request payloads, credentials, and personal information must never be supplied.
 */
export async function reportApplicationError(
  report: ApplicationErrorReport,
): Promise<ApplicationErrorReference> {
  const errorId = randomUUID();
  const code = errorCode(report);
  const operation = safeIdentifier(report.operation, 'unknown_operation', MAX_OPERATION_LENGTH);
  const row = {
    error_code: code,
    error_name: errorName(report.cause),
    id: errorId,
    operation,
    release_id: optionalIdentifier(process.env.VERCEL_GIT_COMMIT_SHA, MAX_CORRELATION_LENGTH),
    request_id: optionalIdentifier(report.requestId, MAX_CORRELATION_LENGTH),
    route: safeRoute(report.route),
    safe_message: safeMessage(report.message),
    severity: report.severity ?? 'error',
  };

  console.error('application_error', row);

  try {
    const { supabase } = await import('./supabase');
    const db = await supabase();
    const { error } = await db.from('application_error_logs').insert(row);
    if (error) {
      console.error('application_error_persistence_failed', {
        errorId,
        persistenceCode: safeIdentifier(error.code, 'PERSISTENCE_FAILED', MAX_CODE_LENGTH),
      });
    }
  } catch (cause) {
    console.error('application_error_persistence_failed', {
      errorId,
      persistenceCode: errorCode({ ...report, cause, code: undefined }),
    });
  }

  return { code, errorId };
}

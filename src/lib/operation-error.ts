/** Safe diagnostics contain operation names and codes, never SDK messages or payloads. */
export function logFailure(operation: string, error: unknown) {
  const code = typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    && /^[A-Za-z0-9_]{1,60}$/.test(error.code)
    ? error.code
    : 'UNEXPECTED_FAILURE';
  console.error(operation, { code });
}

export function operationError(operation: string, message: string, cause: unknown): Error {
  logFailure(operation, cause);
  return new Error(message, { cause });
}

const FALLBACK_REDIRECT_PATH = '/app';
const MAX_REDIRECT_LENGTH = 2048;
const VALIDATION_ORIGIN = 'https://redirect-validation.invalid';
const FIRST_PRINTABLE_CHARACTER_CODE = 32;
const DELETE_CHARACTER_CODE = 127;

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const characterCode = character.charCodeAt(0);
    return (
      characterCode < FIRST_PRINTABLE_CHARACTER_CODE || characterCode === DELETE_CHARACTER_CODE
    );
  });
}

/**
 * Normalize an untrusted callback destination to an internal absolute path.
 *
 * Invalid, oversized, or off-origin input falls back to /app. Queries and
 * fragments retain URL serialization semantics. The reserved validation origin
 * is only used for parsing; this function does not perform network requests.
 *
 * Reject a normalized // prefix as well as an external origin: the caller
 * resolves the returned path against its request origin a second time.
 * Never decode this return value before constructing the redirect URL.
 */
export default function getSafeRedirectPath(input: unknown): string {
  if (
    typeof input !== 'string'
    || input.length > MAX_REDIRECT_LENGTH
    || !input.startsWith('/')
    || input.startsWith('//')
    || containsControlCharacters(input)
  ) {
    return FALLBACK_REDIRECT_PATH;
  }

  let destination: URL;
  try {
    destination = new URL(input, VALIDATION_ORIGIN);
  } catch (error) {
    if (error instanceof TypeError) {
      return FALLBACK_REDIRECT_PATH;
    }
    throw error;
  }

  if (destination.origin !== VALIDATION_ORIGIN || destination.pathname.startsWith('//')) {
    return FALLBACK_REDIRECT_PATH;
  }

  const normalizedPath = destination.href.slice(VALIDATION_ORIGIN.length);
  return normalizedPath.length <= MAX_REDIRECT_LENGTH ? normalizedPath : FALLBACK_REDIRECT_PATH;
}

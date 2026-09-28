import { NextResponse } from 'next/server';
import { runAdministrationDiagnosticForApi } from '@/services/administration-diagnostics';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request) {
  try {
    const result = await runAdministrationDiagnosticForApi(
      await request.json().catch(() => null),
    );
    let status = 200;
    if (!result.ok) {
      const errorStatuses = {
        denied: 403,
        invalid: 400,
        unauthenticated: 401,
        unavailable: 503,
        unsupported: 400,
      } as const;
      status = errorStatuses[result.code];
    }

    return NextResponse.json(result, {
      status,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: 'unavailable',
        error: 'Administration diagnostics are temporarily unavailable. No data was changed.',
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

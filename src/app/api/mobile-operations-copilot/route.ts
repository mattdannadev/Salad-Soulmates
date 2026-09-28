import { NextResponse } from 'next/server';
import queryMobileOperations from '@/services/mobile-operations-copilot';
import isMobileOperationsCopilotEnabled from '@/services/mobile-operations-copilot-gate';

export async function GET(request: Request) {
  if (!isMobileOperationsCopilotEnabled()) {
    return NextResponse.json(
      { ok: false, code: 'denied', error: 'Mobile Copilot is not enabled.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  try {
    const parameters = new URL(request.url).searchParams;
    const rawLimit = parameters.get('limit');
    const result = await queryMobileOperations({
      kind: parameters.get('kind'),
      limit: rawLimit === null ? undefined : Number(rawLimit),
    });
    let status = 200;
    if (!result.ok) {
      if (result.code === 'unauthenticated') status = 401;
      else if (result.code === 'denied') status = 403;
      else if (result.code === 'unavailable') status = 503;
      else status = 400;
    }
    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: 'unavailable', error: 'Mobile Copilot is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

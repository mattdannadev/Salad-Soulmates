import { NextResponse } from 'next/server';
import queryOperations from '@/services/operations-copilot';
import abortable from '@/lib/abortable';

const MAX_REQUEST_BYTES = 2_048;
const REQUEST_TIMEOUT_MS = 5_000;

async function readBoundedJson(request: Request, signal: AbortSignal): Promise<{
  tooLarge: boolean;
  value: unknown;
}> {
  if (!request.body) return { tooLarge: false, value: null };
  const reader = request.body.getReader();
  const cancelReader = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancelReader, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  async function collectChunks(): Promise<boolean> {
    const { done, value } = await abortable(reader.read(), signal);
    if (done) return true;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return false;
    }
    chunks.push(value);
    return collectChunks();
  }
  try {
    if (!await collectChunks()) return { tooLarge: true, value: null };
    const bytes = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    try {
      return { tooLarge: false, value: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch {
      return { tooLarge: false, value: null };
    }
  } finally {
    signal.removeEventListener('abort', cancelReader);
  }
}

export async function POST(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  try {
    const body = await readBoundedJson(request, signal);
    if (body.tooLarge) {
      return NextResponse.json(
        { ok: false, code: 'invalid', error: 'Operations Copilot request is too large.' },
        { status: 413, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    const result = await abortable(queryOperations(body.value, signal), signal);
    let status = 200;
    if (!result.ok) {
      if (result.code === 'unauthenticated') status = 401;
      else if (result.code === 'denied') status = 403;
      else if (result.code === 'unavailable') status = 503;
      else if (result.code === 'rate_limited') status = 429;
      else status = 400;
    }
    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: 'unavailable', error: 'Operations records are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

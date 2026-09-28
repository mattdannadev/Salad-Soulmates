import { NextResponse } from 'next/server';
import runAiWorkspace from '@/services/ai-workspace';

export async function POST(request: Request) {
  try {
    const result = await runAiWorkspace(await request.json().catch(() => null));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, error: 'The AI workspace is unavailable. No data was changed.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reportApplicationError } from '@/lib/error-reporting';

const reportSchema = z.object({
  digest: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/).optional(),
  route: z.string().regex(/^\/[A-Za-z0-9_./-]{0,499}$/),
  scope: z.enum(['application', 'public']),
});

export async function POST(request: Request) {
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid error report.' }, { status: 400 });

  const { digest, route, scope } = parsed.data;
  const reference = await reportApplicationError({
    code: digest ?? 'CLIENT_RENDER_FAILURE',
    message: `The ${scope} page could not be displayed.`,
    operation: `${scope}.render`,
    requestId: request.headers.get('x-vercel-id') ?? undefined,
    route,
  });
  return NextResponse.json(reference, { status: 201 });
}

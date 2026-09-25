import { NextResponse } from 'next/server';
import { z } from 'zod';
import getSafeRedirectPath from '@/lib/safe-redirect-path';
import { supabase } from '@/lib/supabase';

const confirmationSchema = z.object({
  token_hash: z.string().min(1).max(4096),
  type: z.enum(['email', 'invite', 'recovery']),
});

/**
 * Complete invite and recovery links without relying on a PKCE verifier stored
 * in the administrator's browser. The email template sends TokenHash here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const confirmation = confirmationSchema.safeParse({
    token_hash: url.searchParams.get('token_hash'),
    type: url.searchParams.get('type'),
  });
  const destination = getSafeRedirectPath(url.searchParams.get('next'));
  if (confirmation.success) {
    const db = await supabase({ readOnly: false });
    const { error } = await db.auth.verifyOtp(confirmation.data);
    if (!error) return NextResponse.redirect(new URL(destination, url.origin));
  }
  return NextResponse.redirect(new URL('/login?auth=link-invalid', url.origin));
}

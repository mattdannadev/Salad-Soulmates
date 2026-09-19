import { NextResponse } from 'next/server';
import getSafeRedirectPath from '@/lib/safe-redirect-path';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const destination = getSafeRedirectPath(next);
  if (code) {
    const db = await supabase({ readOnly: false });
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, url.origin));
  }
  return NextResponse.redirect(new URL('/login', url.origin));
}

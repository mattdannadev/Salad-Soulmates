import 'server-only';
import { redirect } from 'next/navigation';
import { supabase, isConfigured } from './supabase';
import type { Profile } from '@/domain/master-data';

export async function requireProfile() {
  if (!isConfigured()) redirect('/setup');
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .eq('active', true)
    .single();
  if (error || !data) redirect('/access');
  return { db, profile: data as Profile };
}
export async function requireAdminShell() {
  const ctx = await requireProfile();
  if (ctx.profile.role === 'worker') redirect('/worker');
  if (ctx.profile.role === 'receiver') redirect('/receiving');
  return ctx;
}

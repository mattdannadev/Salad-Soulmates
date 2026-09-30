import 'server-only';
import { z } from 'zod';
import isProviderOwner from '@/data/provider-owner';
import { supabase } from '@/lib/supabase';

export const PROVIDER_FRESH_AUTH_WINDOW_SECONDS = 15 * 60;

const claimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  role: z.literal('authenticated'),
  aud: z.union([z.literal('authenticated'), z.array(z.string()).refine((aud) => aud.includes('authenticated'))]),
  is_anonymous: z.literal(false),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  amr: z.array(z.object({
    method: z.literal('password'),
    timestamp: z.number().int().positive(),
  })).length(1),
});

export class ProviderFreshAuthError extends Error {}

export interface ProviderFreshAuthProof {
  actorUserId: string;
  sessionId: string;
  authenticatedAt: Date;
}

export interface ProviderOwnerPasswordIdentity {
  id: string;
  credential: { email: string } | { phone: string };
}

export async function requireProviderOwnerIdentity(): Promise<ProviderOwnerPasswordIdentity> {
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    throw new ProviderFreshAuthError('Sign in before confirming your password.');
  }
  let credential: ProviderOwnerPasswordIdentity['credential'] | null = null;
  if (user.email && user.email_confirmed_at) {
    credential = { email: user.email };
  } else if (user.phone && user.phone_confirmed_at) {
    credential = { phone: user.phone };
  }
  if (!credential) {
    throw new ProviderFreshAuthError('A confirmed email or phone number is required.');
  }
  if (!(await isProviderOwner(user.id))) {
    throw new ProviderFreshAuthError('Provider Owner access is required.');
  }
  return { id: user.id, credential };
}

/** Inspect only verified claims belonging to the same live user and access token. */
export function validateProviderPasswordClaims(
  claims: unknown,
  userId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ProviderFreshAuthProof {
  const parsed = claimsSchema.safeParse(claims);
  if (!parsed.success || parsed.data.sub !== userId) {
    throw new ProviderFreshAuthError('Confirm your password before continuing.');
  }
  const {
    iat, exp, amr, session_id: sessionId,
  } = parsed.data;
  const authenticatedAt = amr[0]?.timestamp;
  if (authenticatedAt === undefined
    || !Number.isSafeInteger(nowSeconds)
    || iat > nowSeconds
    || exp <= nowSeconds
    || exp <= iat
    || authenticatedAt > iat
    || authenticatedAt > nowSeconds
    || nowSeconds - authenticatedAt > PROVIDER_FRESH_AUTH_WINDOW_SECONDS) {
    throw new ProviderFreshAuthError('Confirm your password before continuing.');
  }
  return { actorUserId: userId, sessionId, authenticatedAt: new Date(authenticatedAt * 1000) };
}

/** Call immediately before every Provider Owner mutation, not only on form display. */
export async function requireRecentProviderOwnerAuthentication(): Promise<ProviderFreshAuthProof> {
  const db = await supabase();
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    throw new ProviderFreshAuthError('Sign in and confirm your password before continuing.');
  }
  const [claimsResult, userResult] = await Promise.all([
    db.auth.getClaims(token),
    db.auth.getUser(token),
  ]);
  const userId = userResult.data.user?.id;
  if (claimsResult.error || !claimsResult.data?.claims || userResult.error || !userId) {
    throw new ProviderFreshAuthError('Sign in and confirm your password before continuing.');
  }
  const proof = validateProviderPasswordClaims(claimsResult.data.claims, userId);
  if (!(await isProviderOwner(userId))) {
    throw new ProviderFreshAuthError('Provider Owner access is required.');
  }
  return proof;
}

import { z } from 'zod';

const hostSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i);

/** Auth callbacks remain on the selected deployment, never an arbitrary request Host header. */
export default function authConfirmationUrl(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const preview = environment.VERCEL_ENV === 'preview';
  const host = preview ? environment.VERCEL_URL : environment.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) {
    if (environment.VERCEL === '1' || preview || environment.VERCEL_ENV === 'production') {
      throw new Error('The deployment Auth callback host is not configured.');
    }
    return 'http://localhost:3000/auth/confirm?next=/reset-password';
  }
  return `https://${hostSchema.parse(host)}/auth/confirm?next=/reset-password`;
}

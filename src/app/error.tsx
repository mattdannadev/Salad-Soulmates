'use client';

import ApplicationErrorPage from '@/components/application-error-page';

export default function ErrorPage(
  { error, reset }: { error: Error & { digest?: string }; reset: () => void },
) {
  return <ApplicationErrorPage error={error} reset={reset} scope="public" />;
}

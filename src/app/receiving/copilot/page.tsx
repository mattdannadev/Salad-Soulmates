import MobileOperationsCopilot from '@/components/mobile-operations-copilot';
import queryMobileOperations from '@/services/mobile-operations-copilot';
import isMobileOperationsCopilotEnabled from '@/services/mobile-operations-copilot-gate';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ReceivingCopilotPage() {
  if (!isMobileOperationsCopilotEnabled()) notFound();
  const result = await queryMobileOperations({ kind: 'deliveries', limit: 10 });
  return <MobileOperationsCopilot result={result} fallbackRole="receiver" />;
}

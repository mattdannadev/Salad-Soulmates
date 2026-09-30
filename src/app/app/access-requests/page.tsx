import { permanentRedirect } from 'next/navigation';
import { canonicalNavigationPath } from '@/components/navigation-registry';

export default function LegacyAccessRequestsPage() {
  permanentRedirect(canonicalNavigationPath('/app/access-requests'));
}

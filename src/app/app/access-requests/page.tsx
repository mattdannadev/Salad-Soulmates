import { permanentRedirect } from 'next/navigation';

export default function LegacyAccessRequestsPage() {
  permanentRedirect('/app/user-management/access-requests');
}

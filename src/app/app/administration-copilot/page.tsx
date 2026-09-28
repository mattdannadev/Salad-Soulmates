import AdministrationCopilot from '@/components/administration-copilot';
import { PageHeader } from '@/components/shell';

export default function AdministrationCopilotPage() {
  return (
    <>
      <PageHeader
        eyebrow="SELF-SERVICE ADMINISTRATION"
        title="Administration Copilot"
        description="Check tenant setup and investigate safe operational signals without changing any data."
      />
      <AdministrationCopilot />
    </>
  );
}

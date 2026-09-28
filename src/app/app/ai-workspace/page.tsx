import AiWorkspaceChat from '@/components/ai-workspace-chat';
import { PageHeader } from '@/components/shell';

export default function AiWorkspacePage() {
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE ASSISTANT"
        title="AI Workspace"
        description="Ask about recipes, orders, inventory, and other workspace activity. Review every proposed change before saving it."
      />
      <AiWorkspaceChat />
    </>
  );
}

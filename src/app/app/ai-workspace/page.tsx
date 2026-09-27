import AiWorkspaceChat from '@/components/ai-workspace-chat';
import { PageHeader } from '@/components/shell';

export default function AiWorkspacePage() {
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE ASSISTANT"
        title="AI Workspace"
        description="Ask about feedback and review proposed updates before saving them."
      />
      <AiWorkspaceChat />
    </>
  );
}

import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import WorkPlanManager from '@/components/work-plan-manager';
import { loadWorkPlanWorkspace } from '@/services/work-plans';
import { workPlanCopy } from '@/components/work-plan-copy';

export default async function WorkPlansPage() {
  const {
    canManage, versions, locale, actorId,
  } = await loadWorkPlanWorkspace();
  if (!canManage) redirect('/app/settings');
  const copy = (text: string) => workPlanCopy(locale, text);
  return (
    <>
      <PageHeader
        eyebrow={copy('SETTINGS · OPERATIONS')}
        title={copy('Work Plans')}
        description={copy('Design clear, repeatable workflows for your plant.')}
      />
      <WorkPlanManager versions={versions} locale={locale} actorId={actorId} />
    </>
  );
}

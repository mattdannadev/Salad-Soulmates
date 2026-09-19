import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { PageHeader } from './shell';

export function PhaseGate({
  eyebrow,
  title,
  description,
  nextStep,
  href,
  linkLabel,
  locale = 'en',
}: {
  eyebrow: string;
  title: string;
  description: string;
  nextStep: string;
  href: string;
  linkLabel: string;
  locale?: 'en' | 'es';
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="panel phase-gate">
        <LockKeyhole size={32} aria-hidden />
        <div>
          <p className="eyebrow">{locale === 'es' ? 'ETAPA DE CONSTRUCCIÓN' : 'BUILD GATE'}</p>
          <h2>{locale === 'es' ? 'Esta fase está en el plan' : 'This phase is in the plan'}</h2>
          <p>{nextStep}</p>
          <Link className="button secondary" href={href}>
            {linkLabel}
          </Link>
        </div>
      </section>
    </>
  );
}

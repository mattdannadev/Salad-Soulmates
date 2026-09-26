import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Leaf, LogOut } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { signOut } from '@/app/actions';
import FeedbackDrawer from '@/components/feedback';
import WorkerPreparations from '@/components/worker-preparations';
import { formatDate } from '@/domain/format';
import loadWorkerPreparations from '@/services/worker-preparations';

export const dynamic = 'force-dynamic';

export default async function Worker() {
  const { db, profile } = await requireProfile();
  const preparations = await loadWorkerPreparations(db);
  if (!preparations) redirect('/access');
  const es = profile.preferred_locale === 'es';
  const days = [...new Set(preparations.map((item) => item.assigned_on))];
  return (
    <main className="worker-page" lang={profile.preferred_locale}>
      <header className="row">
        <Leaf size={34} />
        <form action={signOut}>
          <button type="submit" className="secondary">
            <LogOut size={18} />
            {es ? 'Salir' : 'Sign out'}
          </button>
        </form>
      </header>
      <p className="eyebrow">{es ? 'PLANIFICACIÓN DE PRODUCCIÓN' : 'PRODUCTION PLANNING'}</p>
      <h1>{es ? 'Preparaciones de especias' : 'Spice preparations'}</h1>
      <p>{`${es ? 'Hola' : 'Hello'}, ${profile.display_name.split(' ')[0]}. ${es ? 'Estas son las preparaciones de especias para los próximos lotes de mezcla.' : 'Here are the spice preparations for upcoming mixer batches.'}`}</p>
      {(profile.role === 'admin' || profile.role === 'reviewer') && (
        <nav aria-label={es ? 'Navegación del espacio de trabajo' : 'Workspace navigation'}>
          <Link className="button secondary" href="/app">{es ? 'Volver al panel' : 'Back to dashboard'}</Link>
        </nav>
      )}
      {!days.length && (
        <section className="panel">
          <h2>{es ? 'Sin preparaciones programadas' : 'No preparations scheduled'}</h2>
          <p>{es ? 'Las preparaciones aparecerán aquí cuando se confirme un plan y se asigne un lote de producción.' : 'Preparations appear here once a plan is confirmed and a production lot is assigned.'}</p>
        </section>
      )}
      {days.map((day) => {
        const tasks = preparations.filter((item) => item.assigned_on === day);
        return (
          <section className="worker-day" key={day} aria-label={formatDate(day)}>
            <div className="section-heading">
              <h2>{formatDate(day)}</h2>
              <span className="badge">{`${tasks.filter((item) => item.status === 'Complete').length} / ${tasks.length} ${es ? 'listas' : 'complete'}`}</span>
            </div>
            <WorkerPreparations preparations={tasks} locale={profile.preferred_locale} />
          </section>
        );
      })}
      <FeedbackDrawer locale={profile.preferred_locale} />
    </main>
  );
}

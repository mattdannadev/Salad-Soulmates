import Link from 'next/link';
import { Leaf, LogOut } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { signOut } from '@/app/actions';
import FeedbackDrawer from '@/components/feedback';

export const dynamic = 'force-dynamic';
export default async function Worker() {
  const { profile } = await requireProfile();
  const es = profile.preferred_locale === 'es';
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
      <p className="eyebrow">SALAD SOULMATES</p>
      <h1>
        {`${es ? 'Hola' : 'Hello'}, ${profile.display_name.split(' ')[0]}`}
      </h1>
      <section className="panel">
        <h2>{es ? 'Tu espacio de trabajo' : 'Your workspace'}</h2>
        <p>{es ? 'Estamos preparando esta herramienta.' : 'We are preparing this workspace.'}</p>
        <p>
          {es
            ? 'Los turnos, las solicitudes de tiempo libre y las hojas de lote aún no están disponibles. Consulta a tu supervisor para el trabajo de hoy.'
            : 'Shifts, time-off requests and batch sheets are not available yet. Check with your supervisor for today’s work.'}
        </p>
      </section>
      {(profile.role === 'admin' || profile.role === 'reviewer') && (
        <Link className="button secondary" href="/app">
          {es ? 'Volver a administración' : 'Back to administration'}
        </Link>
      )}
      <FeedbackDrawer locale={profile.preferred_locale} />
    </main>
  );
}

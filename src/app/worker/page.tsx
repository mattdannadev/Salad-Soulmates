import Link from 'next/link';
import { Leaf, LogOut } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { signOut } from '@/app/actions';
import { FeedbackDrawer } from '@/components/feedback';
export const dynamic = 'force-dynamic';
export default async function Worker() {
  const { profile } = await requireProfile();
  return (
    <main className="worker-page" lang="es">
      <header className="row">
        <Leaf size={34} />
        <form action={signOut}>
          <button className="secondary">
            <LogOut size={18} />
            Salir
          </button>
        </form>
      </header>
      <p className="eyebrow">SALAD SOULMATES</p>
      <h1>Hola, {profile.display_name.split(' ')[0]}</h1>
      <section className="panel">
        <h2>Tu espacio de trabajo</h2>
        <p>Estamos preparando esta herramienta.</p>
        <p>
          Los turnos, las solicitudes de tiempo libre y las hojas de lote aún no están disponibles.
          Consulta a tu supervisor para el trabajo de hoy.
        </p>
      </section>
      {(profile.role === 'admin' || profile.role === 'reviewer') && (
        <Link className="button secondary" href="/app">
          Volver a administración
        </Link>
      )}
      <FeedbackDrawer worker />
    </main>
  );
}

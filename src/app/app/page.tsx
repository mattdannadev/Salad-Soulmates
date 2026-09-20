import Link from 'next/link';
import {
  Leaf, Truck, MessageCircle, ArrowRight,
} from 'lucide-react';
import { requireAdminShell } from '@/lib/auth';
import { PageHeader } from '@/components/shell';
import { z } from 'zod';
import { operationError } from '@/lib/operation-error';

export default async function Home() {
  const { db, profile } = await requireAdminShell();
  const es = profile.preferred_locale === 'es';
  const results = await Promise.all(
    (['ingredients', 'suppliers', 'feedback_items'] as const).map((table) => db.from(table).select('id', { count: 'exact', head: true })),
  );
  const counts = results.map((result) => {
    if (result.error) throw operationError('dashboard_counts', 'Unable to load overview.', result.error);
    return z.number().int().nonnegative().parse(result.count);
  });
  const cards = [
    { name: es ? 'Ingredientes' : 'Ingredients', icon: Leaf, href: '/app/ingredients' },
    { name: es ? 'Proveedores' : 'Suppliers', icon: Truck, href: '/app/suppliers' },
    { name: es ? 'Comentarios' : 'Feedback', icon: MessageCircle, href: '/app/feedback' },
  ];
  return (
    <>
      <PageHeader
        eyebrow={es ? 'TU ESPACIO DE OPERACIONES' : 'YOUR OPERATIONS WORKSPACE'}
        title={`${es ? 'Bienvenido' : 'Welcome'}, ${profile.display_name.split(' ')[0]}`}
        description={es
          ? 'Operaciones frescas y bien organizadas. Comienza con los ingredientes y proveedores de tus alimentos.'
          : 'Fresh operations, beautifully organized. Start with the ingredients and partners behind your food.'}
      />
      <div className="stats">
        {cards.map((c, i) => (
          <Link href={c.href} className="stat" key={c.name}>
            <c.icon />
            <div>
              <span>{c.name}</span>
              <strong>{counts[i]}</strong>
            </div>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      <section className="panel">
        <p className="eyebrow">{es ? 'COMENCEMOS CON UNA BUENA BASE' : 'LET’S GET THE FOUNDATIONS RIGHT'}</p>
        <h2>{es ? 'Un buen lugar para comenzar' : 'A good place to begin'}</h2>
        <div className="steps">
          <Link href="/app/ingredients">
            <span className="step-number">1</span>
            <div>
              <h3>{es ? 'Crea tu catálogo de ingredientes' : 'Build your ingredient library'}</h3>
              <p>
                {es
                  ? 'Define la unidad base, el nombre revisado en español, las notas de almacenamiento y los alérgenos.'
                  : 'Set the base unit, reviewed Spanish name, storage notes and allergens.'}
              </p>
            </div>
            <ArrowRight />
          </Link>
          <Link href="/app/suppliers">
            <span className="step-number">2</span>
            <div>
              <h3>{es ? 'Agrega tus proveedores' : 'Add your suppliers'}</h3>
              <p>
                {es
                  ? 'Registra contactos y vincula las presentaciones de compra desde la página de cada ingrediente.'
                  : 'Record contacts and connect purchasing packs from each ingredient’s page.'}
              </p>
            </div>
            <ArrowRight />
          </Link>
          <Link href="/app/inventory">
            <span className="step-number">3</span>
            <div>
              <h3>{es ? 'Registra el inventario inicial' : 'Record starting inventory'}</h3>
              <p>
                {es
                  ? 'Ingresa las cantidades iniciales revisadas de tu planta, con un motivo para cada ajuste.'
                  : 'Enter reviewed opening quantities for your facility, with a reason for every adjustment.'}
              </p>
            </div>
            <ArrowRight />
          </Link>
        </div>
      </section>
      <section className="panel soft">
        <h2>{es ? 'Lo que sigue' : 'What comes next'}</h2>
        <p>
          {es
            ? 'Las siguientes fases completan la recepción, los pedidos de clientes y la planificación, seguidas de los horarios. Cada lote estándar de 40 galones requerirá una cubeta de especias.'
            : 'The next phases complete receiving, customer orders and production planning, then scheduling. Every standard 40-gallon mixer batch will require one spice bucket.'}
        </p>
        <p>
          {es
            ? 'El espacio del personal está diseñado para el uso sencillo en teléfonos. Las asignaciones y el trabajo por lotes estarán disponibles después de su revisión.'
            : 'The worker workspace is designed for simple phone use. Assignments and batch work become available after their review gates.'}
        </p>
      </section>
    </>
  );
}

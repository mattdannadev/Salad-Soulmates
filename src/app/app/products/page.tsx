import { requireAdminShell } from '@/lib/auth';
import { PhaseGate } from '@/components/phase-gate';
export default async function Products() {
  const { profile } = await requireAdminShell();
  const es = profile.preferred_locale === 'es';
  return (
    <PhaseGate
      eyebrow={es ? 'CATÁLOGO' : 'CATALOG'}
      title={es ? 'Productos' : 'Products'}
      description={
        es
          ? 'Los productos terminados conectan los pedidos con una versión activa de receta y un tamaño de empaque.'
          : 'Finished products connect customer orders to an active recipe version and packaging size.'
      }
      nextStep={
        es
          ? 'Esta es la próxima etapa del plan, después de validar ingredientes, proveedores y recepciones.'
          : 'This is the next build gate after ingredients, suppliers and receiving are validated.'
      }
      href="/app/ingredients"
      linkLabel={es ? 'Revisar ingredientes' : 'Review ingredients'}
      locale={profile.preferred_locale}
    />
  );
}

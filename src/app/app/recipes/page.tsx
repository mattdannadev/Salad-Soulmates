import { requireAdminShell } from '@/lib/auth';
import { PhaseGate } from '@/components/phase-gate';
export default async function Recipes() {
  const { profile } = await requireAdminShell();
  const es = profile.preferred_locale === 'es';
  return (
    <PhaseGate
      eyebrow={es ? 'DATOS MAESTROS DE PRODUCCIÓN' : 'PRODUCTION MASTER DATA'}
      title={es ? 'Recetas' : 'Recipes'}
      description={
        es
          ? 'Las recetas versionadas impulsarán los requisitos y las hojas de lote sencillas para trabajadores.'
          : 'Versioned recipes will power requirements and simple Spanish worker batch worksheets.'
      }
      nextStep={
        es
          ? 'Las recetas se abren después de revisar productos, ingredientes, alérgenos, proveedores y empaques.'
          : 'Recipes open after products, ingredients, allergens, suppliers and supplier packs are reviewed. This keeps recipe quantities tied to trusted units.'
      }
      href="/app/products"
      linkLabel={es ? 'Ver etapa de productos' : 'View product gate'}
      locale={profile.preferred_locale}
    />
  );
}

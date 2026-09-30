import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleCheck } from 'lucide-react';
import { requireAdminShell } from '@/lib/auth';
import { resolveReturnContext } from '@/lib/return-context';
import styles from '@/components/workspace-setup.module.css';

const example = [
  {
    en: 'Ingredient: high-oleic canola oil, stocked for dressing production',
    es: 'Ingrediente: aceite de canola alto oleico, disponible para producir aderezo',
  },
  {
    en: 'Supplier pack: Heartland Food Oils, 55-gallon drum',
    es: 'Presentación del proveedor: Heartland Food Oils, tambor de 55 galones',
  },
  {
    en: 'Product and released recipe: 40 gallons of Creamy Buttermilk Ranch',
    es: 'Producto y receta publicada: 40 galones de aderezo ranch cremoso de suero de leche',
  },
  {
    en: 'Customer package price: four 1-gallon cases for Lakeshore University Dining at $78 each',
    es: 'Precio por cliente y presentación: cuatro cajas de 1 galón para Lakeshore University Dining a $78 cada una',
  },
  {
    en: 'Customer order: LUD-PO-10482, planned through pickup',
    es: 'Pedido de cliente: LUD-PO-10482, planificado hasta la recogida',
  },
];

/** The illustration is static and never reads or writes operational sample records. */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ profile }, params] = await Promise.all([requireAdminShell(), searchParams]);
  const es = profile.preferred_locale === 'es';
  const origin = resolveReturnContext(params.returnTo, undefined, {
    fallbackHref: '/app',
    isAllowedPathname: (pathname) => pathname === '/app',
  });
  return (
    <main className={styles.demoPage}>
      <Link className={styles.back} href={`${origin.href}#workspace-setup`}>
        <ArrowLeft size={16} />
        {' '}
        {es ? 'Volver a primeros pasos' : 'Back to getting started'}
      </Link>
      <p className="eyebrow">{es ? 'EJEMPLO ILUSTRATIVO' : 'ILLUSTRATIVE EXAMPLE'}</p>
      <h1>{es ? 'Cómo se prepara un pedido de ranch para Lakeshore' : 'How a Lakeshore ranch order comes together'}</h1>
      <p>
        {es
          ? 'Este escenario ilustrativo utiliza nombres y cantidades sintéticos coherentes. No muestra datos reales ni crea ingredientes, proveedores, recetas, precios o pedidos.'
          : 'This illustrative scenario uses coherent synthetic names and quantities. It does not display live data or create ingredients, suppliers, recipes, prices, or orders.'}
      </p>
      <ol className={styles.exampleList}>
        {example.map((item) => (
          <li key={item.en}>
            <CircleCheck size={20} aria-hidden="true" />
            <span>{es ? item.es : item.en}</span>
          </li>
        ))}
      </ol>
      <Link className={styles.back} href={`${origin.href}#workspace-setup`}>
        {es ? 'Configurar mi espacio de trabajo' : 'Set up my workspace'}
        {' '}
        <ArrowRight size={16} />
      </Link>
    </main>
  );
}

import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleCheck } from 'lucide-react';
import { requireAdminShell } from '@/lib/auth';
import { resolveReturnContext } from '@/lib/return-context';
import styles from '@/components/workspace-setup.module.css';

const example = [
  { en: 'Ingredient: example oil', es: 'Ingrediente: aceite de ejemplo' },
  { en: 'Supplier pack: example case', es: 'Presentación del proveedor: caja de ejemplo' },
  { en: 'Product and released recipe: example dressing', es: 'Producto y receta publicada: aderezo de ejemplo' },
  { en: 'Customer package price: example price', es: 'Precio por cliente y presentación: precio de ejemplo' },
  { en: 'Customer order: example pickup', es: 'Pedido de cliente: recogida de ejemplo' },
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
      <h1>{es ? 'Cómo se prepara un primer pedido' : 'How a first order comes together'}</h1>
      <p>
        {es
          ? 'Este recorrido es solo un ejemplo. No muestra datos reales ni crea ingredientes, proveedores, recetas, precios o pedidos.'
          : 'This walkthrough is an example only. It does not display live data or create ingredients, suppliers, recipes, prices, or orders.'}
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

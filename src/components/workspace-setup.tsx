import Link from 'next/link';
import {
  ArrowRight, CircleCheck, CircleHelp, LockKeyhole, RotateCcw,
} from 'lucide-react';
import type { SetupStep, SetupStepId } from '@/services/workspace-setup';
import styles from './workspace-setup.module.css';

const setupDestinations: Record<SetupStepId, string> = {
  ingredients: '/app/ingredients?status=active&returnTo=%2Fapp',
  suppliers: '/app/suppliers?returnTo=%2Fapp',
  products: '/app/products?returnTo=%2Fapp',
  pricing: '/app/products?pricing=missing&returnTo=%2Fapp',
  orders: '/app/orders?returnTo=%2Fapp#new-order',
};

const copy: Record<SetupStepId, { en: string; es: string; actionEn: string; actionEs: string }> = {
  ingredients: {
    en: 'Add ingredients',
    es: 'Agregar ingredientes',
    actionEn: 'Open ingredients',
    actionEs: 'Abrir ingredientes',
  },
  suppliers: {
    en: 'Connect suppliers and packs',
    es: 'Conectar proveedores y presentaciones',
    actionEn: 'Open suppliers',
    actionEs: 'Abrir proveedores',
  },
  products: {
    en: 'Set up products and released recipes',
    es: 'Configurar productos y recetas publicadas',
    actionEn: 'Open products',
    actionEs: 'Abrir productos',
  },
  pricing: {
    en: 'Set customer package pricing',
    es: 'Configurar precios para clientes',
    actionEn: 'Open pricing',
    actionEs: 'Abrir precios',
  },
  orders: {
    en: 'Create a customer order',
    es: 'Crear un pedido de cliente',
    actionEn: 'Open orders',
    actionEs: 'Abrir pedidos',
  },
};

function countLabel(step: SetupStep, es: boolean): string {
  const counts = step.counts ?? [];
  if (step.id === 'suppliers') {
    return es
      ? `${counts[0]} proveedores · ${counts[1]} presentaciones`
      : `${counts[0]} suppliers · ${counts[1]} packs`;
  }
  if (step.id === 'products') {
    return es
      ? `${counts[0]} productos · ${counts[1]} versiones publicadas`
      : `${counts[0]} products · ${counts[1]} released versions`;
  }
  const singular: Record<SetupStepId, [string, string]> = {
    ingredients: ['ingredients', 'ingredientes'],
    suppliers: ['suppliers', 'proveedores'],
    products: ['products', 'productos'],
    pricing: ['active prices', 'precios activos'],
    orders: ['customer orders', 'pedidos de clientes'],
  };
  return `${counts[0]} ${singular[step.id][es ? 1 : 0]}`;
}

function statusDescription(step: SetupStep, es: boolean) {
  if (step.state === 'denied') {
    return (
      <small>
        <LockKeyhole size={13} />
        {' '}
        {es ? 'Pide acceso a un administrador.' : 'Ask an administrator for access.'}
      </small>
    );
  }
  if (step.state === 'error') {
    return <small>{es ? 'No se pudo cargar este progreso.' : 'This progress could not be loaded.'}</small>;
  }
  if (step.state === 'missing' && !step.canAct) {
    return <small>{es ? 'Pide a un administrador que complete este paso.' : 'Ask an administrator to complete this step.'}</small>;
  }
  return <small>{countLabel(step, es)}</small>;
}

function stepAction(step: SetupStep, es: boolean) {
  if (step.state === 'error') {
    return (
      <Link href="/app?setupRetry=1#workspace-setup">
        <RotateCcw size={15} />
        {' '}
        {es ? 'Reintentar' : 'Retry'}
      </Link>
    );
  }
  if (step.state === 'denied') return null;
  if (step.state === 'missing' && !step.canAct) return null;
  const labels = copy[step.id];
  return (
    <Link href={setupDestinations[step.id]}>
      {es ? labels.actionEs : labels.actionEn}
      {' '}
      <ArrowRight size={15} />
    </Link>
  );
}

/** Ordered first-use guidance stays separate from the live operations panels. */
export default function WorkspaceSetup({ steps, es }: { steps: SetupStep[]; es: boolean }) {
  const ready = steps.filter((step) => step.state === 'ready').length;
  return (
    <section className={styles.section} id="workspace-setup" aria-labelledby="workspace-setup-heading">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">{es ? 'PRIMEROS PASOS' : 'GETTING STARTED'}</p>
          <h2 id="workspace-setup-heading">{es ? 'Prepara tu espacio de trabajo' : 'Set up your workspace'}</h2>
          <p>
            {es
              ? 'Sigue este orden para preparar tu primer pedido. El progreso se basa en los registros que puedes consultar.'
              : 'Follow this order to prepare your first order. Progress reflects records you can access.'}
          </p>
        </div>
        <span className={styles.progress}>{`${ready}/${steps.length} ${es ? 'listos' : 'ready'}`}</span>
      </div>
      <ol className={styles.list}>
        {steps.map((step) => {
          const labels = copy[step.id];
          return (
            <li className={styles.item} key={step.id}>
              <span className={styles.icon} aria-hidden="true">
                {step.state === 'ready' ? <CircleCheck size={20} /> : <CircleHelp size={20} />}
              </span>
              <div className={styles.text}>
                <strong>{es ? labels.es : labels.en}</strong>
                {statusDescription(step, es)}
              </div>
              {stepAction(step, es)}
            </li>
          );
        })}
      </ol>
      <div className={styles.demo}>
        <p>
          {es
            ? '¿Quieres ver cómo encajan los pasos? Explora un ejemplo ilustrativo sin crear registros.'
            : 'Want to see how the steps fit together? Explore an illustration without creating records.'}
        </p>
        <Link href="/app/demo?returnTo=%2Fapp">
          {es ? 'Ver ejemplo' : 'View example'}
          {' '}
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}

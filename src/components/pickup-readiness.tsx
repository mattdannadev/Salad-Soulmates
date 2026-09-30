import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Ban,
  Check,
  CircleAlert,
  Clock3,
  type LucideIcon,
} from 'lucide-react';
import styles from './pickup-readiness.module.css';

export type PickupReadinessState = 'complete' | 'in_progress' | 'pending' | 'blocked' | 'not_required';

export interface PickupReadinessLinks {
  order: string;
  productionPlan?: string;
  ingredients?: string;
  spicePrep?: string;
  mixing?: string;
  packaging?: string;
  sanitation?: string;
}

export interface PickupReadinessData {
  id: string;
  customerName: string;
  orderReference: string;
  pickupOn: string;
  hasProductionPlan: boolean;
  hasIngredientShortage: boolean;
  inboundSupplyExpected: boolean;
  spicePrep: PickupReadinessState;
  mixing: PickupReadinessState;
  packaging: PickupReadinessState;
  sanitation: PickupReadinessState;
  pickup: Exclude<PickupReadinessState, 'not_required'>;
  links: PickupReadinessLinks;
}

interface PickupReadinessProps {
  pickup: PickupReadinessData;
  locale: 'en' | 'es';
}

interface ReadinessStage {
  id: string;
  label: string;
  state: PickupReadinessState;
  href?: string;
}

const STATE_ICONS: Record<PickupReadinessState, LucideIcon> = {
  complete: Check,
  in_progress: Clock3,
  pending: Clock3,
  blocked: CircleAlert,
  not_required: Ban,
};

function StageContent({ children, href = undefined }: { children: ReactNode; href?: string }) {
  return href
    ? <Link className={styles.stageLink} href={href}>{children}</Link>
    : <span className={styles.stageBody}>{children}</span>;
}

/** Compact, permission-agnostic readiness presentation for one customer pickup. */
export default function PickupReadiness({ pickup, locale }: PickupReadinessProps) {
  const headingId = useId();
  const es = locale === 'es';
  let ingredientState: PickupReadinessState = 'complete';
  if (pickup.hasIngredientShortage) ingredientState = 'blocked';
  else if (pickup.inboundSupplyExpected) ingredientState = 'in_progress';
  const stateLabels: Record<PickupReadinessState, string> = es
    ? {
      complete: 'Listo',
      in_progress: 'En curso',
      pending: 'Pendiente',
      blocked: 'Bloqueado',
      not_required: 'No requerido',
    }
    : {
      complete: 'Ready',
      in_progress: 'In progress',
      pending: 'Pending',
      blocked: 'Blocked',
      not_required: 'Not required',
    };
  const stages: ReadinessStage[] = [
    {
      id: 'plan',
      label: es ? 'Plan' : 'Plan',
      state: pickup.hasProductionPlan ? 'complete' : 'blocked',
      href: pickup.links.productionPlan,
    },
    {
      id: 'ingredients',
      label: es ? 'Ingredientes' : 'Ingredients',
      state: ingredientState,
      href: pickup.links.ingredients,
    },
    {
      id: 'spice-prep',
      label: es ? 'Especias' : 'Spice prep',
      state: pickup.spicePrep,
      href: pickup.links.spicePrep,
    },
    {
      id: 'mixing',
      label: es ? 'Mezcla' : 'Mixing',
      state: pickup.mixing,
      href: pickup.links.mixing,
    },
    {
      id: 'packaging',
      label: es ? 'Empaque' : 'Packaging',
      state: pickup.packaging,
      href: pickup.links.packaging,
    },
    {
      id: 'sanitation',
      label: es ? 'Limpieza' : 'Sanitation',
      state: pickup.sanitation,
      href: pickup.links.sanitation,
    },
    {
      id: 'pickup',
      label: es ? 'Recogida' : 'Pickup',
      state: pickup.pickup,
      href: pickup.links.order,
    },
  ];
  const dateLabel = new Intl.DateTimeFormat(es ? 'es-US' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${pickup.pickupOn}T12:00:00Z`));

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div>
          <p className={styles.date}>
            {es ? 'Recogida' : 'Pickup'}
            {' · '}
            {dateLabel}
          </p>
          <h3 id={headingId}>
            <Link href={pickup.links.order}>{pickup.customerName}</Link>
          </h3>
          <p className={styles.reference}>{pickup.orderReference}</p>
        </div>
        <span className={`${styles.overall} ${styles[`state_${pickup.pickup}`]}`}>
          {stateLabels[pickup.pickup]}
        </span>
      </header>

      <ol className={styles.chain} aria-label={es ? 'Estado de preparación de la recogida' : 'Pickup readiness status'}>
        {stages.map((stage) => {
          const Icon = STATE_ICONS[stage.state];
          return (
            <li className={`${styles.stage} ${styles[`state_${stage.state}`]}`} key={stage.id}>
              <StageContent href={stage.href}>
                <span className={styles.icon}><Icon size={14} aria-hidden /></span>
                <span className={styles.stageCopy}>
                  <strong>{stage.label}</strong>
                  <small>{stateLabels[stage.state]}</small>
                </span>
              </StageContent>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

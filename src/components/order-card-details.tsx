import { formatDate, formatNumber } from '@/domain/format';
import type { OrderCard } from '@/services/order-cards';
import styles from './order-card-details.module.css';

/** Facts shown on saved-order cards; dates and products come from the order snapshot. */
export default function OrderCardDetails({ card, locale }: {
  card: OrderCard;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  return (
    <div className={styles.details}>
      <dl className={styles.dates}>
        <div>
          <dt>{es ? 'Pedido registrado' : 'Order placed'}</dt>
          <dd>{formatDate(card.order.created_at)}</dd>
        </div>
        <div>
          <dt>{es ? 'Recogida del cliente' : 'Customer pickup'}</dt>
          <dd>{formatDate(card.order.needed_on)}</dd>
        </div>
      </dl>
      <div>
        <strong className={styles.label}>{es ? 'Productos y lotes' : 'Products and batches'}</strong>
        <ul className={styles.products}>
          {card.order.items.map((item) => (
            <li key={item.product_id}>
              <span>{item.product_name}</span>
              <span>{`${formatNumber(item.batch_count)} ${es ? 'lotes' : 'batches'}`}</span>
            </li>
          ))}
        </ul>
        <p className={styles.total}>
          {`${formatNumber(card.order.items.reduce((sum, item) => sum + item.batch_count, 0))} ${es ? 'lotes en total' : 'total batches'}`}
        </p>
      </div>
      <div>
        <strong className={styles.label}>{es ? 'Notas del cliente' : 'Customer notes'}</strong>
        <p className={styles.notes}>{card.customerNotes || (es ? 'Sin notas' : 'No notes')}</p>
      </div>
    </div>
  );
}

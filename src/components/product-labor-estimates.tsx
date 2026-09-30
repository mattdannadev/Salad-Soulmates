'use client';

import { useState, useTransition } from 'react';
import { saveProductLaborEstimate } from '@/app/product-labor-actions';

export default function ProductLaborEstimates({
  product, canWrite, locale,
}: {
  product: { id: string; ingredient_prep_minutes_per_batch: number | null; ingredient_prep_crew_size: number | null; mixing_minutes_per_batch: number | null; mixing_crew_size: number | null };
  canWrite: boolean;
  locale: 'en' | 'es';
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const es = locale === 'es';
  return <section className="panel" aria-labelledby={`labor-${product.id}`}>
    <h3 id={`labor-${product.id}`}>{es ? 'Estimaciones de planificación de producción' : 'Production planning estimates'}</h3>
    <p>{es ? 'Se usan para estimar la capacidad diaria; no son objetivos de desempeño.' : 'Used to estimate daily capacity; they are not performance targets.'}</p>
    <div className="form-grid">
      <label>{es ? 'Preparación: minutos por lote' : 'Ingredient prep: minutes per batch'}
        <input id={`prep-minutes-${product.id}`} type="number" min="0.25" step="0.25" defaultValue={product.ingredient_prep_minutes_per_batch ?? ''} disabled={!canWrite || pending} />
      </label>
      <label>{es ? 'Preparación: personas' : 'Ingredient prep: crew'}
        <input id={`prep-crew-${product.id}`} type="number" min="1" step="1" defaultValue={product.ingredient_prep_crew_size ?? ''} disabled={!canWrite || pending} />
      </label>
      <label>{es ? 'Mezcla: minutos por lote' : 'Mixing: minutes per batch'}
        <input id={`mix-minutes-${product.id}`} type="number" min="0.25" step="0.25" defaultValue={product.mixing_minutes_per_batch ?? ''} disabled={!canWrite || pending} />
      </label>
      <label>{es ? 'Mezcla: personas' : 'Mixing: crew'}
        <input id={`mix-crew-${product.id}`} type="number" min="1" step="1" defaultValue={product.mixing_crew_size ?? ''} disabled={!canWrite || pending} />
      </label>
    </div>
    {canWrite && <button className="button" type="button" disabled={pending} onClick={() => startTransition(async () => {
      const value = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
      const result = await saveProductLaborEstimate({ product_id: product.id,
        ingredient_prep_minutes_per_batch: value(`prep-minutes-${product.id}`), ingredient_prep_crew_size: value(`prep-crew-${product.id}`),
        mixing_minutes_per_batch: value(`mix-minutes-${product.id}`), mixing_crew_size: value(`mix-crew-${product.id}`) });
      setMessage(result.message);
    })}>{pending ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar estimaciones' : 'Save estimates')}</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}

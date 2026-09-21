'use client';

import {
  useId, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import savePackaging from '@/app/packaging-actions';
import { DEFAULT_LABEL_WIDTH, DEFAULT_LABEL_HEIGHT } from '@/domain/packaging';
import type { PackagingVersion } from '@/domain/packaging';
import PackagingLabelPreview from './packaging-label-preview';

export interface PackagingProduct {
  id: string;
  name: string;
  bag_size_gallons: number;
  bags_per_case: number;
  approved_ingredient_statement: string | null;
}

export default function PackagingForm({
  product, latest, locale,
}: { product: PackagingProduct; latest: PackagingVersion | null; locale: 'en' | 'es' }) {
  const prefix = useId();
  const es = locale === 'es';
  const savingLabel = es ? 'Guardando…' : 'Saving…';
  const draftLabel = es ? 'Guardar borrador de empaque' : 'Save packaging draft';
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const [name, setName] = useState(latest?.display_name ?? product.name);
  const [statement, setStatement] = useState(latest?.ingredient_statement ?? product.approved_ingredient_statement ?? '');
  const [width, setWidth] = useState(String(latest?.label_width_inches ?? DEFAULT_LABEL_WIDTH));
  const [height, setHeight] = useState(String(latest?.label_height_inches ?? DEFAULT_LABEL_HEIGHT));
  function submit(form: FormData) {
    const payload = {
      product_id: product.id,
      expected_version: latest?.version ?? 0,
      status: form.get('intent'),
      bag_size_gallons: Number(form.get('bag_size_gallons')),
      bags_per_case: Number(form.get('bags_per_case')),
      label_width_inches: Number(width),
      label_height_inches: Number(height),
      display_name: name,
      ingredient_statement: statement,
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, id: crypto.randomUUID() };
    }
    const { id } = request.current;
    setMessage('');
    startTransition(async () => {
      try {
        const result = await savePackaging({ ...payload, id });
        if (result.ok) {
          setMessage(es ? 'Versión guardada.' : result.message);
          router.refresh();
        } else {
          setMessage(es ? 'No se pudo guardar. Revise los datos; si otra persona cambió la configuración, vuelva a cargar. Para reintentar, conserve los mismos datos.' : result.message);
        }
      } catch {
        setMessage(es ? 'Conexión interrumpida. Reintente con los mismos datos.' : 'Connection interrupted. Retry with the same entries.');
      }
    });
  }
  return (
    <div className="packaging-editor">
      <form onSubmit={(event) => {
        event.preventDefault();
        const submitter = event.nativeEvent instanceof SubmitEvent
          ? event.nativeEvent.submitter : null;
        submit(new FormData(event.currentTarget, submitter));
      }}
      >
        <fieldset disabled={pending}>
          <legend>{es ? 'Nueva versión de empaque' : 'New packaging version'}</legend>
          <div className="form-grid">
            <label htmlFor={`${prefix}-bag`}>
              {es ? 'Galones por bolsa' : 'Gallons per bag'}
              <input id={`${prefix}-bag`} name="bag_size_gallons" type="number" required min="0.0001" max="1000" step="0.0001" defaultValue={latest?.bag_size_gallons ?? product.bag_size_gallons} />
            </label>
            <label htmlFor={`${prefix}-case`}>
              {es ? 'Bolsas por caja' : 'Bags per case'}
              <input id={`${prefix}-case`} name="bags_per_case" type="number" required min="1" max="1000" step="1" defaultValue={latest?.bags_per_case ?? product.bags_per_case} />
            </label>
            <label htmlFor={`${prefix}-width`}>
              {es ? 'Ancho de etiqueta (pulgadas)' : 'Label width (inches)'}
              <input id={`${prefix}-width`} name="label_width_inches" type="number" required min="1" max="12" step="0.01" value={width} onChange={(event) => setWidth(event.currentTarget.value)} />
            </label>
            <label htmlFor={`${prefix}-height`}>
              {es ? 'Alto de etiqueta (pulgadas)' : 'Label height (inches)'}
              <input id={`${prefix}-height`} name="label_height_inches" type="number" required min="1" max="12" step="0.01" value={height} onChange={(event) => setHeight(event.currentTarget.value)} />
            </label>
          </div>
          <p>{es ? 'Una etiqueta por bolsa. Las dimensiones se pueden cambiar en versiones futuras.' : 'One label per bag. Dimensions can change in future versions.'}</p>
          <label htmlFor={`${prefix}-name`}>
            {es ? 'Nombre del producto en la etiqueta' : 'Label product name'}
            <input id={`${prefix}-name`} name="display_name" required maxLength={120} value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <label htmlFor={`${prefix}-statement`}>
            {es ? 'Declaración de ingredientes aprobada' : 'Approved ingredient statement'}
            <textarea id={`${prefix}-statement`} name="ingredient_statement" maxLength={4000} rows={5} value={statement} onChange={(event) => setStatement(event.currentTarget.value)} />
          </label>
          <p>{es ? 'Copie el texto aprobado. No se genera a partir de la receta. Al aprobar, confirma este texto y establece el empaque predeterminado para pedidos futuros.' : 'Copy approved wording; it is not generated from the recipe. Approval confirms this content and sets packaging defaults for future orders.'}</p>
          <div className="packaging-form-actions">
            <button className="button secondary" type="submit" name="intent" value="Draft">{pending ? savingLabel : draftLabel}</button>
            <button className="button" type="submit" name="intent" value="Approved" disabled={!statement.trim()}>{es ? 'Aprobar versión de empaque' : 'Approve packaging version'}</button>
          </div>
        </fieldset>
        <p role="status" aria-live="polite">{message}</p>
      </form>
      <PackagingLabelPreview
        displayName={name}
        ingredientStatement={statement}
        width={Number(width)}
        height={Number(height)}
        locale={locale}
      />
    </div>
  );
}

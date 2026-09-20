import type { SerializedUnit } from '@/domain/receiving';
import ReceivingSubmit from './receiving-submit';

export default function PackageChangeForm({ unit, locale }: {
  unit: SerializedUnit; locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  return (
    <details className="panel">
      <summary>{es ? 'Actualizar saldo o retención' : 'Update balance or hold status'}</summary>
      <p>
        {es ? 'La corrección ajusta el inventario y conserva el historial. No registra uso en producción.'
          : 'Use a measured balance correction or change the hold status. Corrections update inventory and preserve history; production usage is recorded in the later batch workflow.'}
      </p>
      <ReceivingSubmit
        operation="change"
        locale={locale}
        values={{ unit_id: unit.id, expected_revision: unit.revision }}
        submit={es ? 'Guardar cambio del paquete' : 'Save package change'}
      >
        <div className="form-grid">
          <label htmlFor="package-remaining">
            {es ? 'Cantidad restante' : 'Remaining quantity'}
            {' '}
            (
            {unit.uom}
            )
            <input
              id="package-remaining"
              name="remaining_quantity"
              type="number"
              min="0"
              max={unit.initial_quantity}
              step="0.0001"
              defaultValue={unit.remaining_quantity}
              required
            />
          </label>
          <label htmlFor="package-status">
            {es ? 'Estado' : 'Status'}
            <select id="package-status" name="status" defaultValue={unit.status}>
              <option value="Available">{es ? 'Disponible' : 'Available'}</option>
              <option value="Hold">{es ? 'Retenido' : 'Hold'}</option>
              <option value="Quarantined">{es ? 'Cuarentena' : 'Quarantined'}</option>
            </select>
          </label>
          <label className="wide" htmlFor="package-reason">
            {es ? 'Motivo obligatorio' : 'Required reason'}
            <textarea id="package-reason" name="reason" required minLength={3} maxLength={1000} />
          </label>
        </div>
      </ReceivingSubmit>
    </details>
  );
}

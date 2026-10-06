import { describe, expect, it } from 'vitest';
import { workPlanActionMessage, workPlanCopy } from '@/components/work-plan-copy';

describe('Work Plan presentation copy', () => {
  it('translates labels and lifecycle values while keeping English copy stable', () => {
    expect(workPlanCopy('es', 'Work Plans')).toBe('Planes de trabajo');
    expect(workPlanCopy('es', 'released')).toBe('Publicado');
    expect(workPlanCopy('es', 'Step dependencies')).toBe('Dependencias entre pasos');
    expect(workPlanCopy('en', 'Save draft changes')).toBe('Save draft changes');
    expect(workPlanCopy('es', 'Submit for review')).toBe('Enviar a revisión');
    expect(workPlanCopy('es', 'Return to draft')).toBe('Volver a borrador');
    expect(workPlanCopy('es', 'Retire version')).toBe('Retirar versión');
    expect(workPlanActionMessage('es', 'Work Plan lifecycle updated.'))
      .toBe('Se actualizó el estado del plan de trabajo.');
  });

  it('localizes duplicate-code and conflict recovery feedback', () => {
    expect(workPlanActionMessage('es', 'A Work Plan already uses that code.'))
      .toBe('Ya existe un plan de trabajo con ese código.');
    expect(workPlanActionMessage('es', 'Work Plan version changed; reload and try again.'))
      .toBe('La versión del plan de trabajo cambió. Recarga e intenta de nuevo.');
  });

  it('replaces unknown server messages with safe recovery copy in either language', () => {
    const unknown = 'private database or connection details';
    expect(workPlanActionMessage('es', unknown))
      .toBe('Se interrumpió la conexión. Recarga antes de volver a intentar.');
    expect(workPlanActionMessage('en', unknown))
      .toBe('Connection interrupted. Reload before retrying.');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import WorkspaceSetup from '@/components/workspace-setup';
import type { SetupStep } from '@/services/workspace-setup';

const steps: SetupStep[] = [
  {
    id: 'ingredients', state: 'missing', counts: [0], canAct: true,
  },
  { id: 'suppliers', state: 'ready', counts: [1, 1] },
  { id: 'products', state: 'denied' },
  { id: 'pricing', state: 'error' },
  {
    id: 'orders', state: 'missing', counts: [0], canAct: false,
  },
];

it('shows ordered bilingual setup guidance without actions for denied records', () => {
  const markup = renderToStaticMarkup(createElement(WorkspaceSetup, { steps, es: true }));
  expect(markup.indexOf('Agregar ingredientes')).toBeLessThan(markup.indexOf('Conectar proveedores'));
  expect(markup).toContain('Pide acceso a un administrador.');
  expect(markup).toContain('No se pudo cargar este progreso.');
  expect(markup).toContain('Pide a un administrador que complete este paso.');
  expect(markup).toContain('/app?setupRetry=1#workspace-setup');
  expect(markup).not.toContain('/app/products?returnTo=');
  expect(markup).toContain('/app/demo?returnTo=%2Fapp');
});

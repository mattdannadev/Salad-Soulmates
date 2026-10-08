import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import DashboardQuickActions from '@/components/dashboard-quick-actions';

it('opens the URL-addressable order dialog from dashboard quick actions with Home as its return origin', () => {
  const markup = renderToStaticMarkup(createElement(DashboardQuickActions, { es: false }));
  expect(markup).toContain('href="/app/orders?returnTo=%2Fapp&amp;create=order"');
  expect(markup).not.toContain('/app/orders#new-order');
});

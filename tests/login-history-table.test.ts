import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LoginHistoryTable from '../src/components/login-history-table';

describe('LoginHistoryTable', () => {
  it('renders user, timestamp, outcome and source without exposing absent fields', () => {
    const html = renderToStaticMarkup(createElement(LoginHistoryTable, {
      locale: 'en',
      entries: [{
        id: 'event-1',
        userName: 'Avery Green',
        occurredAt: '2026-09-21T16:30:00Z',
        eventType: 'signed_in',
        source: 'Test browser · 192.0.2.1',
      }],
    }));
    expect(html).toContain('Avery Green');
    expect(html).toContain('Timestamp');
    expect(html).toContain('Signed in');
    expect(html).toContain('Test browser · 192.0.2.1');
  });

  it('shows a localized empty state', () => {
    const html = renderToStaticMarkup(createElement(LoginHistoryTable, {
      locale: 'es',
      entries: [],
    }));
    expect(html).toContain('Aún no hay actividad de acceso');
    expect(html).toContain('inicios y cierres de sesión');
  });
});

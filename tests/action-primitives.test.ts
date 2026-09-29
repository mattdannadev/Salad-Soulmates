import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ActionButton from '../src/components/action-button';
import BackButton from '../src/components/back-button';
import FormFooter from '../src/components/form-footer';

describe('ActionButton', () => {
  it('renders a typed submit button with a visible pending state', () => {
    const html = renderToStaticMarkup(ActionButton({
      type: 'submit',
      pending: true,
      pendingLabel: 'Saving…',
      children: 'Save changes',
    }));

    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Saving…');
    expect(html).not.toContain('Save changes');
  });

  it('requires an accessible name for an icon-only action', () => {
    const html = renderToStaticMarkup(createElement(ActionButton, {
      variant: 'icon-only',
      'aria-label': 'Close dialog',
      icon: createElement('span', null, '×'),
    }));

    expect(html).toContain('aria-label="Close dialog"');
    expect(html).toContain('type="button"');
    expect(html).toContain('×');
  });

  it('uses button semantics for a destructive action', () => {
    const html = renderToStaticMarkup(ActionButton({
      variant: 'destructive',
      children: 'Deactivate ingredient',
    }));

    expect(html).toContain('<button');
    expect(html).toContain('Deactivate ingredient');
    expect(html).not.toContain('<a ');
  });
});

describe('BackButton', () => {
  it('links to a named destination with query state', () => {
    const html = renderToStaticMarkup(createElement(BackButton, {
      href: '/app/orders?status=open',
      label: 'Back to orders',
    }));

    expect(html).toContain('href="/app/orders?status=open"');
    expect(html).toContain('Back to orders');
    expect(html).not.toContain('<button');
  });

  it('rejects an external destination', () => {
    expect(() => renderToStaticMarkup(createElement(BackButton, {
      href: '//example.com',
      label: 'Back',
    }))).toThrow('internal destination');
  });
});

describe('FormFooter', () => {
  it('renders submit and cancel controls with live success feedback', () => {
    const html = renderToStaticMarkup(createElement(FormFooter, {
      submitLabel: 'Create customer',
      cancelLabel: 'Cancel',
      cancelHref: '/app/customers?q=smith',
      feedback: { kind: 'success', message: 'Customer created.' },
    }));

    expect(html).toContain('type="submit"');
    expect(html).toContain('href="/app/customers?q=smith"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Customer created.');
  });

  it('announces errors and prevents cancellation while pending', () => {
    const html = renderToStaticMarkup(createElement(FormFooter, {
      submitLabel: 'Save changes',
      cancelLabel: 'Cancel',
      cancelHref: '/app/customers',
      pending: true,
      pendingLabel: 'Saving…',
      feedback: { kind: 'error', message: 'Check the customer name.' },
    }));

    expect(html).toContain('role="alert"');
    expect(html).toContain('Check the customer name.');
    expect(html).toContain('Saving…');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('href="/app/customers"');
  });
});

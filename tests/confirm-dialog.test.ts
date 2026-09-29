import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe, expect, it, vi,
} from 'vitest';
import ConfirmDialog from '../src/components/confirm-dialog';

describe('ConfirmDialog', () => {
  it('gives the native dialog a name, description, and explicit actions', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, {
      open: true,
      title: 'Deactivate ingredient?',
      description: 'Existing history will be retained.',
      confirmLabel: 'Deactivate ingredient',
      cancelLabel: 'Cancel',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }));

    expect(html).toContain('<dialog');
    const ids = html.match(/<dialog[^>]+aria-labelledby="([^"]+)"[^>]+aria-describedby="([^"]+)"/);
    expect(ids).not.toBeNull();
    expect(html).toContain(`<h2 id="${ids?.[1]}">Deactivate ingredient?</h2>`);
    expect(html).toContain(`<p id="${ids?.[2]}">Existing history will be retained.</p>`);
    expect(html).toContain('Cancel');
    expect(html).toContain('Deactivate ingredient');
    expect(html).toContain('type="button"');
  });

  it('disables both choices and announces progress while pending', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, {
      open: true,
      title: 'Deactivate ingredient?',
      description: 'Existing history will be retained.',
      confirmLabel: 'Deactivate ingredient',
      cancelLabel: 'Cancel',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      pending: true,
      pendingLabel: 'Deactivating…',
    }));

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Deactivating…');
  });
});

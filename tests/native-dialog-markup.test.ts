import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  CreateOrganizationControl,
  OperationsCopilotPlanControl,
  OrganizationStatusControl,
  type OrganizationSummary,
} from '@/components/admin/organization-controls';

const organization: OrganizationSummary = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Example Kitchen',
  slug: 'example-kitchen',
  status: 'active',
  operationsCopilotPlanEnabled: false,
  enabledUserCount: 4,
  createdAt: '2026-09-27T12:00:00.000Z',
};

it('gives repeated organization dialogs distinct labels and descriptions', () => {
  const html = renderToStaticMarkup(createElement(
    Fragment,
    null,
    createElement(CreateOrganizationControl, { action: async () => {} }),
    createElement(OrganizationStatusControl, { action: async () => {}, organization }),
    createElement(OperationsCopilotPlanControl, { action: async () => {}, organization }),
  ));
  const dialogTags = [...html.matchAll(/<dialog\b[^>]*>/g)].map(([tag]) => tag);
  expect(dialogTags).toHaveLength(3);
  const ids = dialogTags.flatMap((tag) => [
    tag.match(/aria-labelledby="([^"]+)"/)?.[1],
    tag.match(/aria-describedby="([^"]+)"/)?.[1],
  ]);
  expect(ids.every(Boolean)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  ids.forEach((id) => expect(html).toContain(`id="${id}"`));
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  OperationsCopilotPlanControl,
  type OrganizationSummary,
} from '../src/components/admin/organization-controls';

const organization: OrganizationSummary = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Example Kitchen',
  slug: 'example-kitchen',
  status: 'active',
  operationsCopilotPlanEnabled: false,
  enabledUserCount: 4,
  createdAt: '2026-09-27T12:00:00.000Z',
};

it('explains platform enablement and requires an audited reason', () => {
  const html = renderToStaticMarkup(createElement(OperationsCopilotPlanControl, {
    action: async () => {},
    organization,
  }));
  expect(html).toContain('Enable Copilot');
  expect(html).toContain('Tenant administrators still choose which profiles and users receive access.');
  expect(html).toContain('This reason is saved in the immutable audit history.');
  expect(html).toContain('name="reason"');
  expect(html).toContain('required=""');
});

it('warns that disabling preserves tenant assignments', () => {
  const html = renderToStaticMarkup(createElement(OperationsCopilotPlanControl, {
    action: async () => {},
    organization: { ...organization, operationsCopilotPlanEnabled: true },
  }));
  expect(html).toContain('Disable Copilot');
  expect(html).toContain('Tenant profile and user settings are preserved');
  expect(html).toContain('value="false"');
});

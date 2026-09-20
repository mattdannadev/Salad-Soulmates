import { expect, test as base } from '@playwright/test';

/** Prepare the disposable database and profile before rendering any app route. */
export const test = base.extend<{ preparedDatabase: void }>({
  preparedDatabase: [async ({ request }, use) => {
    const reset = await request.post('http://127.0.0.1:4010/rest/v1/test/purchasing-reset');
    expect(reset.ok()).toBe(true);
    const profile = await request.patch(
      'http://127.0.0.1:4010/rest/v1/profiles?id=eq.00000000-0000-4000-8000-000000000001',
      { data: { preferred_locale: 'en' } },
    );
    expect(profile.ok()).toBe(true);
    await use();
  }, { auto: true }],
});

export { expect };

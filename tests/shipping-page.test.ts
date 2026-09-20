import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import Shipping from '@/app/app/shipping/page';
import loadShippingWorkspace from '@/lib/shipping-data';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), permission: vi.fn(), rows: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.auth }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/data', () => ({ rows: mocks.rows }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT');
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ db: {}, profile: { preferred_locale: 'en' } });
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockResolvedValue([]);
});
it('checks read permissions before querying any customer records', async () => {
  mocks.permission.mockResolvedValue(false);
  await expect(loadShippingWorkspace()).rejects.toThrow('REDIRECT');
  expect(mocks.rows).not.toHaveBeenCalled();
});
it('propagates query failures instead of presenting an empty shipping queue', async () => {
  mocks.rows.mockRejectedValueOnce(new Error('DATABASE_UNAVAILABLE'));
  await expect(loadShippingWorkspace()).rejects.toThrow('DATABASE_UNAVAILABLE');
});
it('requires planning and order write permission before offering preparation', async () => {
  mocks.permission.mockImplementation(
    (_db: unknown, permission: string) => Promise.resolve(permission !== 'planning.write'),
  );
  expect((await loadShippingWorkspace()).canWrite).toBe(false);
});
it('renders honest empty state with unavailable confirmation', async () => {
  const html = renderToStaticMarkup(await Shipping({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('No customer orders yet.');
  expect(html).toContain('Confirmation awaits packaging');
  expect(html).toContain('disabled=""');
  expect(html).not.toContain('Save draft');
});
it('renders Spanish shipping preparation', async () => {
  mocks.auth.mockResolvedValue({ db: {}, profile: { preferred_locale: 'es' } });
  const html = renderToStaticMarkup(await Shipping({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Borradores de envío');
  expect(html).toContain('Confirmación pendiente de empaque');
});
it.each(['bad-id', '00000000-0000-4000-8000-000000000999'])('rejects invalid or inaccessible orders: %s', async (order) => {
  await expect(Shipping({ searchParams: Promise.resolve({ order }) })).rejects.toThrow('NOT_FOUND');
});

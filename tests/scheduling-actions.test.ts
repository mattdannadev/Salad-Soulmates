import {
  beforeEach, expect, it, vi,
} from 'vitest';
import { deleteScheduleEvent, saveFacilitySchedulingSettings, saveScheduleEvent } from '@/app/app/scheduling/actions';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), log: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const id = '00000000-0000-4000-8000-000000000001';
const event = {
  id,
  facility_id: id,
  revision: 0,
  start_on: '2026-09-28',
  end_on: '2026-09-29',
  kind: 'mixing',
  title: '',
  production_plan_id: null,
  employee_ids: [id],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc }, profile: { facility_id: id } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});

it('rejects malformed assignments before authentication', async () => {
  expect((await saveScheduleEvent({ ...event, end_on: event.start_on })).ok).toBe(false);
  expect(mocks.profile).not.toHaveBeenCalled();
});
it('rejects edits outside the caller facility and without workforce permission', async () => {
  expect((await saveScheduleEvent({ ...event, facility_id: '00000000-0000-4000-8000-000000000002' })).ok).toBe(false);
  mocks.permission.mockResolvedValue(false);
  expect((await saveScheduleEvent(event)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('saves, deletes, and changes capacity through separate scoped RPCs', async () => {
  expect((await saveScheduleEvent(event)).ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith('save_workforce_schedule_event', {
    payload: {
      ...event,
      linked_task_type: null,
      linked_task_id: null,
      availability_override_reason: null,
      product_id: null,
      customer_id: null,
      location_label: null,
    },
  });
  expect((await deleteScheduleEvent({ id, facility_id: id, revision: 1 })).ok).toBe(true);
  const settings = await saveFacilitySchedulingSettings({
    facility_id: id, weekly_capacity_hours: 37.5,
  });
  expect(settings.ok).toBe(true);
  expect(mocks.permission).toHaveBeenCalledWith(expect.anything(), 'settings.manage');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/scheduling');
});
it('surfaces concurrent revisions without leaking unexpected database messages', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Schedule changed; reload and try again' } });
  expect((await saveScheduleEvent(event)).message).toBe('Schedule changed; reload and try again');
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'internal query text' } });
  expect((await saveScheduleEvent(event)).message).not.toContain('internal query text');
});

it('identifies the worker and dates for a validated schedule conflict', async () => {
  const conflict = 'Approved PTO conflicts with Maria for 2026-10-07 to 2026-10-08';
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: conflict } });
  expect((await saveScheduleEvent(event)).message).toBe(conflict);
});

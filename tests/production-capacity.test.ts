import { describe, expect, it } from 'vitest';
import { estimateMixingCapacity } from '@/domain/production-capacity';

describe('mixing production capacity', () => {
  it('derives ranch daily batches and required mixing days from its estimated mix time', () => {
    expect(estimateMixingCapacity({
      required_batches: 50,
      mixing_minutes_per_batch: 18,
      mixing_crew_size: 1,
      assigned_people: 1,
      productive_mixing_minutes_per_day: 360,
    })).toMatchObject({
      timeBasedBatchesPerDay: 20,
      committedBatchesPerDay: 20,
      committedMixingDays: 3,
      totalMixerMinutes: 900,
    });
  });

  it('uses the committed cap when a fast product could exceed it', () => {
    expect(estimateMixingCapacity({
      required_batches: 48,
      mixing_minutes_per_batch: 12,
      mixing_crew_size: 1,
      assigned_people: 1,
      productive_mixing_minutes_per_day: 480,
    })).toMatchObject({
      committedBatchesPerDay: 24, stretchBatchesPerDay: 27, committedMixingDays: 2,
    });
  });

  it('does not claim capacity when the required crew is absent', () => {
    expect(estimateMixingCapacity({
      required_batches: 1,
      mixing_minutes_per_batch: 15,
      mixing_crew_size: 2,
      assigned_people: 1,
      productive_mixing_minutes_per_day: 360,
    })).toMatchObject({
      staffingReady: false, committedBatchesPerDay: 0, committedMixingDays: null,
    });
  });
});

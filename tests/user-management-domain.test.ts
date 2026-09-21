import { describe, expect, it } from 'vitest';
import {
  deactivateUserAccessSchema,
  loginEventSchema,
  userProfileSchema,
} from '../src/domain/record-schemas';

const userId = '00000000-0000-4000-8000-000000000001';

describe('user management schemas', () => {
  it('accepts a complete organization user identity', () => {
    expect(
      userProfileSchema.safeParse({
        id: userId,
        first_name: 'Ana',
        last_name: 'Rivera',
        display_name: 'Ana Rivera',
        work_email: 'ana@example.com',
        facility_id: '00000000-0000-4000-8000-000000000002',
        access_profile_id: '00000000-0000-4000-8000-000000000003',
        preferred_locale: 'es',
        active: true,
      }).success,
    ).toBe(true);
    expect(
      userProfileSchema.safeParse({
        id: userId,
        first_name: 'Ana',
        last_name: 'Rivera',
        display_name: 'Ana Rivera',
        work_email: null,
        facility_id: '00000000-0000-4000-8000-000000000002',
        access_profile_id: '00000000-0000-4000-8000-000000000003',
        preferred_locale: 'es',
        active: true,
      }).success,
    ).toBe(true);
  });

  it('rejects malformed login events and incomplete deactivation reasons', () => {
    expect(loginEventSchema.safeParse({ event_type: 'password_reset' }).success).toBe(false);
    expect(
      deactivateUserAccessSchema.safeParse({ target_user_id: userId, reason: 'x' }).success,
    ).toBe(false);
  });
});

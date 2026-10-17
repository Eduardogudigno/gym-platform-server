import { evaluateCheckIn } from '../../src/modules/attendance/check-in.policy';
import {
  addBillingPeriod,
  assertAction,
  computeRenewalRate,
  dueReminderTypes,
} from '../../src/modules/subscriptions/subscription.policy';

describe('subscription policy', () => {
  it('adds calendar months for each billing period', () => {
    const start = new Date('2026-01-31T00:00:00.000Z');
    expect(addBillingPeriod(start, 'monthly', 'UTC').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addBillingPeriod(new Date('2026-11-15T00:00:00.000Z'), 'quarterly', 'UTC').toISOString()).toBe(
      '2027-02-15T00:00:00.000Z',
    );
    expect(addBillingPeriod(new Date('2026-01-15T00:00:00.000Z'), 'yearly', 'UTC').toISOString()).toBe(
      '2027-01-15T00:00:00.000Z',
    );
  });

  it('selects reminder buckets that the remaining time has entered', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const day = 24 * 60 * 60 * 1000;
    expect(dueReminderTypes(now, new Date(now.getTime() + 10 * day), [7, 3, 1])).toEqual([]);
    expect(dueReminderTypes(now, new Date(now.getTime() + 2 * day), [7, 3, 1])).toEqual([
      'expiring_7d',
      'expiring_3d',
    ]);
    expect(dueReminderTypes(now, new Date(now.getTime() + 12 * 60 * 60 * 1000), [7, 3, 1])).toEqual([
      'expiring_7d',
      'expiring_3d',
      'expiring_1d',
    ]);
    expect(dueReminderTypes(now, new Date(now.getTime() - 1000), [7, 3, 1])).toEqual([]);
  });

  it('computes renewal rate from renewed, expired and cancelled events', () => {
    expect(computeRenewalRate({ renewed: 0, expired: 0, cancelled: 0 }).rate).toBeNull();
    expect(computeRenewalRate({ renewed: 1, expired: 1, cancelled: 0 })).toMatchObject({
      denominator: 2,
      rate: 0.5,
    });
  });

  it('rejects actions that the current status does not allow', () => {
    expect(() => assertAction('pending', 'pause')).toThrow('Cannot pause');
    expect(() => assertAction('active', 'pause')).not.toThrow();
  });
});

describe('check-in policy', () => {
  const now = new Date('2026-02-01T00:00:00.000Z');

  it('allows an active member inside the subscription window', () => {
    expect(
      evaluateCheckIn({
        memberStatus: 'active',
        now,
        subscription: {
          status: 'active',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-03-01T00:00:00.000Z'),
        },
      }),
    ).toEqual({ allowed: true });
  });

  it('denies suspended members, paused subscriptions and ended periods', () => {
    expect(
      evaluateCheckIn({
        memberStatus: 'suspended',
        now,
        subscription: { status: 'active', startDate: now, endDate: new Date('2026-03-01T00:00:00.000Z') },
      }),
    ).toEqual({ allowed: false, reason: 'MEMBER_NOT_ACTIVE' });
    expect(
      evaluateCheckIn({
        memberStatus: 'active',
        now,
        subscription: { status: 'paused', startDate: now, endDate: new Date('2026-03-01T00:00:00.000Z') },
      }),
    ).toEqual({ allowed: false, reason: 'NO_ACTIVE_SUBSCRIPTION' });
    expect(
      evaluateCheckIn({
        memberStatus: 'active',
        now,
        subscription: {
          status: 'active',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: now,
        },
      }),
    ).toEqual({ allowed: false, reason: 'SUBSCRIPTION_EXPIRED' });
  });
});

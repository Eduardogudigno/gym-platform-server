import { AppError } from '../../src/common/errors/app-error';
import type { MemberRecord, MemberRepository } from '../../src/modules/members/member.ports';
import type { PlanRecord, PlanRepository } from '../../src/modules/plans/plan.ports';
import type {
  PaymentRepository,
  SubscriptionEventRecord,
  SubscriptionEventRepository,
  SubscriptionRecord,
  SubscriptionRepository,
  SubscriptionWrite,
} from '../../src/modules/subscriptions/billing.ports';
import {
  SubscriptionService,
  type SubscriptionServiceOptions,
} from '../../src/modules/subscriptions/subscription.service';
import type { Transaction, TransactionRunner } from '../../src/common/transaction';

const tx: TransactionRunner = {
  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return work({} as Transaction);
  },
};

function member(id = 'member-1'): MemberRecord {
  return {
    id,
    userId: 'user-1',
    email: 'member@gym.local',
    firstName: 'Ana',
    lastName: 'Paz',
    phone: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    city: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    status: 'active',
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function plan(partial: Partial<PlanRecord> & Pick<PlanRecord, 'id' | 'duration' | 'price'>): PlanRecord {
  return {
    name: partial.id,
    description: null,
    currency: 'USD',
    benefits: [],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...partial,
  };
}

class MemorySubscriptions implements SubscriptionRepository {
  rows: SubscriptionRecord[] = [];

  async findById(id: string): Promise<SubscriptionRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    return row ? { ...row } : null;
  }

  async findOpenByMemberId(memberId: string): Promise<SubscriptionRecord | null> {
    const row = this.rows.find(
      (item) => item.memberId === memberId && ['pending', 'active', 'paused'].includes(item.status),
    );
    return row ? { ...row } : null;
  }

  async findAccessible(): Promise<SubscriptionRecord | null> {
    return null;
  }

  async list(): Promise<{ rows: SubscriptionRecord[]; total: number }> {
    return { rows: this.rows, total: this.rows.length };
  }

  async create(input: SubscriptionWrite): Promise<SubscriptionRecord> {
    const row: SubscriptionRecord = {
      id: `sub-${this.rows.length + 1}`,
      memberId: input.memberId,
      planId: input.planId,
      scheduledPlanId: input.scheduledPlanId ?? null,
      renewedFromId: input.renewedFromId ?? null,
      status: input.status,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      nextRenewalAt: input.nextRenewalAt ?? null,
      autoRenew: input.autoRenew,
      priceAmount: input.priceAmount,
      currency: input.currency,
      pausedAt: null,
      frozenEndAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdBy: input.createdBy ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, patch: Partial<SubscriptionRecord>): Promise<SubscriptionRecord> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    Object.assign(row, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)));
    return { ...row };
  }

  async listDueForExpiry(now: Date): Promise<SubscriptionRecord[]> {
    return this.rows
      .filter((row) => row.status === 'active' && row.endDate !== null && row.endDate <= now)
      .map((row) => ({ ...row }));
  }

  async listStalePending(cutoff: Date): Promise<SubscriptionRecord[]> {
    return this.rows.filter((row) => row.status === 'pending' && row.createdAt <= cutoff);
  }

  async listActive(now: Date): Promise<SubscriptionRecord[]> {
    return this.rows.filter((row) => row.status === 'active' && row.endDate !== null && row.endDate > now);
  }
}

function build(nowRef: { value: Date }) {
  const subscriptions = new MemorySubscriptions();
  const events: SubscriptionEventRecord[] = [];
  const members = new Map<string, MemberRecord>([['member-1', member()]]);
  const plans = new Map<string, PlanRecord>([
    ['monthly', plan({ id: 'monthly', duration: 'monthly', price: '39.99' })],
    ['quarterly', plan({ id: 'quarterly', duration: 'quarterly', price: '99.99' })],
    ['yearly', plan({ id: 'yearly', duration: 'yearly', price: '349.99' })],
  ]);
  const memberRepo: MemberRepository = {
    findById: async (id) => members.get(id) ?? null,
    findByUserId: async (userId) => [...members.values()].find((row) => row.userId === userId) ?? null,
    list: async () => ({ rows: [...members.values()], total: members.size }),
    create: async () => {
      throw new Error('not used');
    },
    update: async () => {
      throw new Error('not used');
    },
    softDelete: async () => undefined,
  };
  const planRepo: PlanRepository = {
    findById: async (id) => plans.get(id) ?? null,
    list: async () => ({ rows: [...plans.values()], total: plans.size }),
    create: async () => {
      throw new Error('not used');
    },
    update: async () => {
      throw new Error('not used');
    },
    softDelete: async () => undefined,
  };
  const eventRepo: SubscriptionEventRepository = {
    append: async (input) => {
      const row: SubscriptionEventRecord = {
        id: `evt-${events.length + 1}`,
        subscriptionId: input.subscriptionId,
        type: input.type,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        fromPlanId: input.fromPlanId ?? null,
        toPlanId: input.toPlanId ?? null,
        payload: input.payload ?? null,
        actorUserId: input.actorUserId ?? null,
        createdAt: input.createdAt,
      };
      events.push(row);
      return row;
    },
    listBySubscription: async (subscriptionId) => events.filter((row) => row.subscriptionId === subscriptionId),
    countByTypes: async () => ({}),
  };
  const paymentRepo = { create: async () => undefined } as unknown as PaymentRepository;
  const options: SubscriptionServiceOptions = {
    timeZone: 'UTC',
    pendingTtlHours: 72,
    clock: () => nowRef.value,
  };
  const service = new SubscriptionService(subscriptions, planRepo, memberRepo, eventRepo, paymentRepo, tx, options);
  return { service, subscriptions, events, members };
}

async function activeSubscription(harness: ReturnType<typeof build>, end: Date, start = new Date('2026-01-01T00:00:00.000Z')) {
  const created = await harness.service.create(
    { memberId: 'member-1', planId: 'monthly', startDate: start },
    'staff-1',
  );
  const row = harness.subscriptions.rows[0]!;
  row.status = 'active';
  row.startDate = start;
  row.endDate = end;
  return created.id;
}

describe('subscription lifecycle', () => {
  const now = { value: new Date('2026-01-15T00:00:00.000Z') };

  function harness() {
    now.value = new Date('2026-01-15T00:00:00.000Z');
    return build(now);
  }

  it('extends an active subscription from its current end date', async () => {
    const ctx = harness();
    const id = await activeSubscription(ctx, new Date('2026-02-01T00:00:00.000Z'));
    const renewed = await ctx.service.renew(id, {}, 'staff-1');
    expect(renewed.status).toBe('active');
    expect(renewed.startDate?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(renewed.endDate?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(ctx.events.map((event) => event.type)).toContain('renewed');
  });

  it('starts a new period when renewing an expired subscription', async () => {
    const ctx = harness();
    const id = await activeSubscription(ctx, new Date('2026-02-01T00:00:00.000Z'));
    ctx.subscriptions.rows[0]!.status = 'expired';
    now.value = new Date('2026-02-10T00:00:00.000Z');
    const renewed = await ctx.service.renew(id, {}, 'staff-1');
    expect(renewed.startDate?.toISOString()).toBe('2026-02-10T00:00:00.000Z');
    expect(renewed.endDate?.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(renewed.status).toBe('active');
  });

  it('freezes remaining time while paused and restores it on resume', async () => {
    const ctx = harness();
    const id = await activeSubscription(ctx, new Date('2026-03-01T00:00:00.000Z'));
    now.value = new Date('2026-02-01T00:00:00.000Z');
    const paused = await ctx.service.pause(id, 'staff-1');
    expect(paused.status).toBe('paused');
    expect(paused.frozenEndAt?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    now.value = new Date('2026-02-11T00:00:00.000Z');
    const resumed = await ctx.service.resume(id, 'staff-1');
    expect(resumed.status).toBe('active');
    expect(resumed.endDate?.toISOString()).toBe('2026-03-11T00:00:00.000Z');
    expect(resumed.pausedAt).toBeNull();
  });

  it('expires active subscriptions and cancels abandoned pending ones without touching pauses', async () => {
    const ctx = harness();
    const expiredId = await activeSubscription(ctx, new Date('2026-01-01T00:00:00.000Z'));
    ctx.members.set('member-2', member('member-2'));
    now.value = new Date('2025-12-01T00:00:00.000Z');
    const pending = await ctx.service.create({ memberId: 'member-2', planId: 'monthly' }, 'staff-1');
    ctx.members.set('member-3', member('member-3'));
    const paused = await ctx.service.create({ memberId: 'member-3', planId: 'monthly' }, 'staff-1');
    const pausedRow = ctx.subscriptions.rows.find((row) => row.id === paused.id)!;
    pausedRow.status = 'paused';
    pausedRow.endDate = new Date('2026-01-01T00:00:00.000Z');
    pausedRow.pausedAt = new Date('2025-12-01T00:00:00.000Z');
    pausedRow.frozenEndAt = pausedRow.endDate;
    now.value = new Date('2026-01-15T00:00:00.000Z');

    const result = await ctx.service.expireDue();
    expect(result.expired.map((row) => row.id)).toEqual([expiredId]);
    expect(result.cancelledPendingIds).toEqual([pending.id]);
    expect(ctx.subscriptions.rows.find((row) => row.id === paused.id)?.status).toBe('paused');
    expect(ctx.subscriptions.rows.find((row) => row.id === pending.id)?.cancellationReason).toBe('payment_timeout');
  });

  it('changes plan immediately and can schedule the next cycle', async () => {
    const ctx = harness();
    const id = await activeSubscription(ctx, new Date('2026-02-01T00:00:00.000Z'));
    now.value = new Date('2026-01-15T00:00:00.000Z');
    const scheduled = await ctx.service.changePlan(id, { planId: 'quarterly', mode: 'next_cycle' }, 'staff-1');
    expect(scheduled.planId).toBe('monthly');
    expect(scheduled.scheduledPlanId).toBe('quarterly');
    expect(scheduled.endDate?.toISOString()).toBe('2026-02-01T00:00:00.000Z');

    const renewed = await ctx.service.renew(id, {}, 'staff-1');
    expect(renewed.planId).toBe('quarterly');
    expect(renewed.priceAmount).toBe('99.99');
    expect(renewed.scheduledPlanId).toBeNull();
    expect(renewed.endDate?.toISOString()).toBe('2026-05-01T00:00:00.000Z');

    const immediate = await ctx.service.changePlan(id, { planId: 'yearly', mode: 'immediate' }, 'staff-1');
    expect(immediate.planId).toBe('yearly');
    expect(immediate.priceAmount).toBe('349.99');
    expect(immediate.startDate?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(immediate.endDate?.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(ctx.events.filter((event) => event.type === 'plan_changed')).toHaveLength(2);
  });

  it('rejects a pause from pending and a second open subscription', async () => {
    const ctx = harness();
    const pending = await ctx.service.create({ memberId: 'member-1', planId: 'monthly' }, 'staff-1');
    await expect(ctx.service.pause(pending.id, 'staff-1')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(ctx.service.create({ memberId: 'member-1', planId: 'monthly' }, 'staff-1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_ALREADY_OPEN',
    });
  });
});

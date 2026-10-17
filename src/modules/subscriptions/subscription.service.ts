import { assertSelfOrStaff } from '../../common/access';
import { AppError } from '../../common/errors/app-error';
import type { AuthContext } from '../../common/types/auth';
import { toMoney } from '../../common/money';
import type { Transaction, TransactionRunner } from '../../common/transaction';
import type { PlanChangeMode } from '../../common/types/domain';
import type { MemberRepository } from '../members/member.ports';
import type { PlanRepository } from '../plans/plan.ports';
import type {
  PaymentRepository,
  PaymentWrite,
  SubscriptionEventRepository,
  SubscriptionListQuery,
  SubscriptionRecord,
  SubscriptionRepository,
} from './billing.ports';
import {
  activationWindow,
  addBillingPeriod,
  assertAction,
  immediatePlanWindow,
  renewalWindow,
  resumeWindow,
} from './subscription.policy';

export interface Clock {
  (): Date;
}

export interface SubscriptionServiceOptions {
  timeZone: string;
  pendingTtlHours: number;
  clock: Clock;
}

export interface SubscriptionPaymentInput {
  method: PaymentWrite['method'];
  amount?: string;
  reference?: string;
  status?: 'pending' | 'completed' | 'failed';
  idempotencyKey?: string;
  notes?: string;
}

export interface CreateSubscriptionInput {
  memberId: string;
  planId: string;
  startDate?: Date | null;
  autoRenew?: boolean;
  renewedFromId?: string;
  payment?: SubscriptionPaymentInput;
}

export interface RenewSubscriptionInput {
  autoRenew?: boolean;
  payment?: SubscriptionPaymentInput;
}

export interface ChangePlanInput {
  planId: string;
  mode: PlanChangeMode;
}

export interface ExpireDueResult {
  expired: Array<{ id: string; memberId: string; endDate: Date }>;
  cancelledPendingIds: string[];
}

const CLEARED_HOLD = {
  pausedAt: null,
  frozenEndAt: null,
  cancelledAt: null,
  cancellationReason: null,
};

export class SubscriptionService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
    private readonly members: MemberRepository,
    private readonly events: SubscriptionEventRepository,
    private readonly payments: PaymentRepository,
    private readonly tx: TransactionRunner,
    private readonly options: SubscriptionServiceOptions,
  ) {}

  list(query: SubscriptionListQuery): Promise<{ rows: SubscriptionRecord[]; total: number }> {
    return this.subscriptions.list(query);
  }

  async getForActor(id: string, actor: AuthContext): Promise<SubscriptionRecord> {
    const row = await this.require(id);
    await this.assertReadable(row.memberId, actor);
    return row;
  }

  async eventsForActor(id: string, actor: AuthContext) {
    await this.getForActor(id, actor);
    return this.events.listBySubscription(id);
  }

  async create(input: CreateSubscriptionInput, actorId: string, tx?: Transaction): Promise<SubscriptionRecord> {
    if (tx) return this.createLocked(input, actorId, tx);
    return this.tx.run((transaction) => this.createLocked(input, actorId, transaction));
  }

  private async createLocked(
    input: CreateSubscriptionInput,
    actorId: string,
    tx: Transaction,
  ): Promise<SubscriptionRecord> {
    const member = await this.requireActiveMember(input.memberId, tx);
    const plan = await this.requireActivePlan(input.planId, tx);
    const open = await this.subscriptions.findOpenByMemberId(member.id, tx, true);
    if (open) {
      throw new AppError(409, 'SUBSCRIPTION_ALREADY_OPEN', 'Member already has an open subscription');
    }
    if (input.renewedFromId) {
      await this.assertRenewedFrom(input.renewedFromId, member.id, tx);
    }
    const now = this.now();
    const startDate = input.startDate ?? now;
    const created = await this.subscriptions.create(
      {
        memberId: member.id,
        planId: plan.id,
        renewedFromId: input.renewedFromId ?? null,
        status: 'pending',
        startDate,
        endDate: addBillingPeriod(startDate, plan.duration, this.options.timeZone),
        nextRenewalAt: null,
        autoRenew: input.autoRenew ?? false,
        priceAmount: plan.price,
        currency: plan.currency,
        createdBy: actorId,
        createdAt: now,
      },
      tx,
    );
    await this.events.append(
      {
        subscriptionId: created.id,
        type: 'created',
        fromStatus: null,
        toStatus: 'pending',
        toPlanId: plan.id,
        actorUserId: actorId,
        createdAt: now,
        payload: { startDate: startDate.toISOString(), endDate: created.endDate?.toISOString() ?? null },
      },
      tx,
    );
    if (!input.payment) return created;
    await this.recordPayment(created, input.payment, actorId, now, tx);
    if ((input.payment.status ?? 'completed') === 'completed') {
      return this.activateLocked(created.id, actorId, tx);
    }
    return this.require(created.id, tx);
  }

  async activate(id: string, actorId: string, tx?: Transaction): Promise<SubscriptionRecord> {
    if (tx) return this.activateLocked(id, actorId, tx);
    return this.tx.run((transaction) => this.activateLocked(id, actorId, transaction));
  }

  async renew(id: string, input: RenewSubscriptionInput, actorId: string): Promise<SubscriptionRecord> {
    return this.tx.run(async (tx) => {
      const current = await this.requireLocked(id, tx);
      assertAction(current.status, 'renew');
      if (!current.endDate) {
        throw new AppError(409, 'INVALID_STATE', 'Subscription has no end date');
      }
      const plan = current.scheduledPlanId
        ? await this.requireActivePlan(current.scheduledPlanId, tx)
        : await this.requirePlan(current.planId, tx);
      const now = this.now();
      const autoRenew = input.autoRenew ?? current.autoRenew;
      const window = renewalWindow({
        now,
        currentStart: current.startDate,
        currentEnd: current.endDate,
        period: plan.duration,
        timeZone: this.options.timeZone,
        autoRenew,
      });
      const updated = await this.subscriptions.update(
        id,
        {
          ...CLEARED_HOLD,
          planId: plan.id,
          scheduledPlanId: null,
          status: 'active',
          autoRenew,
          priceAmount: plan.price,
          currency: plan.currency,
          ...window,
        },
        tx,
      );
      await this.events.append(
        {
          subscriptionId: id,
          type: 'renewed',
          fromStatus: current.status,
          toStatus: 'active',
          fromPlanId: current.planId,
          toPlanId: plan.id,
          actorUserId: actorId,
          createdAt: now,
          payload: {
            previousEndDate: current.endDate.toISOString(),
            endDate: window.endDate.toISOString(),
          },
        },
        tx,
      );
      if (input.payment) await this.recordPayment(updated, input.payment, actorId, now, tx);
      return updated;
    });
  }

  async pause(id: string, actorId: string): Promise<SubscriptionRecord> {
    return this.tx.run(async (tx) => {
      const current = await this.requireLocked(id, tx);
      assertAction(current.status, 'pause');
      if (!current.endDate) throw new AppError(409, 'INVALID_STATE', 'Subscription has no end date');
      const now = this.now();
      const updated = await this.subscriptions.update(
        id,
        {
          status: 'paused',
          pausedAt: now,
          frozenEndAt: current.endDate,
          nextRenewalAt: null,
        },
        tx,
      );
      await this.events.append(
        {
          subscriptionId: id,
          type: 'paused',
          fromStatus: 'active',
          toStatus: 'paused',
          actorUserId: actorId,
          createdAt: now,
          payload: { frozenEndAt: current.endDate.toISOString() },
        },
        tx,
      );
      return updated;
    });
  }

  async resume(id: string, actorId: string): Promise<SubscriptionRecord> {
    return this.tx.run(async (tx) => {
      const current = await this.requireLocked(id, tx);
      assertAction(current.status, 'resume');
      if (!current.pausedAt || !current.frozenEndAt) {
        throw new AppError(409, 'INVALID_STATE', 'Paused subscription is missing freeze data');
      }
      const now = this.now();
      const window = resumeWindow({
        now,
        pausedAt: current.pausedAt,
        frozenEndAt: current.frozenEndAt,
        autoRenew: current.autoRenew,
      });
      const updated = await this.subscriptions.update(
        id,
        {
          status: 'active',
          pausedAt: null,
          frozenEndAt: null,
          endDate: window.endDate,
          nextRenewalAt: window.nextRenewalAt,
        },
        tx,
      );
      await this.events.append(
        {
          subscriptionId: id,
          type: 'resumed',
          fromStatus: 'paused',
          toStatus: 'active',
          actorUserId: actorId,
          createdAt: now,
          payload: {
            pausedAt: current.pausedAt.toISOString(),
            endDate: window.endDate.toISOString(),
          },
        },
        tx,
      );
      return updated;
    });
  }

  async cancel(id: string, actorId: string, reason?: string): Promise<SubscriptionRecord> {
    return this.tx.run(async (tx) => {
      const current = await this.requireLocked(id, tx);
      assertAction(current.status, 'cancel');
      const now = this.now();
      const updated = await this.subscriptions.update(
        id,
        {
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: reason ?? null,
          nextRenewalAt: null,
        },
        tx,
      );
      await this.events.append(
        {
          subscriptionId: id,
          type: 'cancelled',
          fromStatus: current.status,
          toStatus: 'cancelled',
          actorUserId: actorId,
          createdAt: now,
          payload: reason ? { reason } : null,
        },
        tx,
      );
      return updated;
    });
  }

  async changePlan(id: string, input: ChangePlanInput, actorId: string): Promise<SubscriptionRecord> {
    return this.tx.run(async (tx) => {
      const current = await this.requireLocked(id, tx);
      assertAction(current.status, 'change_plan');
      const plan = await this.requireActivePlan(input.planId, tx);
      if (plan.id === current.planId && !current.scheduledPlanId) {
        throw new AppError(409, 'PLAN_UNCHANGED', 'Subscription is already on this plan');
      }
      const now = this.now();
      if (input.mode === 'next_cycle') {
        if (current.status !== 'active') {
          throw new AppError(409, 'INVALID_STATE', 'Only an active subscription can change plan on the next cycle');
        }
        const updated = await this.subscriptions.update(id, { scheduledPlanId: plan.id }, tx);
        await this.events.append(
          {
            subscriptionId: id,
            type: 'plan_changed',
            fromStatus: current.status,
            toStatus: current.status,
            fromPlanId: current.planId,
            toPlanId: plan.id,
            actorUserId: actorId,
            createdAt: now,
            payload: { mode: 'next_cycle' },
          },
          tx,
        );
        return updated;
      }
      const window =
        current.status === 'pending'
          ? {
              startDate: current.startDate,
              endDate: current.startDate
                ? addBillingPeriod(current.startDate, plan.duration, this.options.timeZone)
                : null,
              nextRenewalAt: null,
            }
          : immediatePlanWindow({
              now,
              period: plan.duration,
              timeZone: this.options.timeZone,
              autoRenew: current.autoRenew,
            });
      const updated = await this.subscriptions.update(
        id,
        {
          planId: plan.id,
          scheduledPlanId: null,
          priceAmount: plan.price,
          currency: plan.currency,
          ...window,
        },
        tx,
      );
      await this.events.append(
        {
          subscriptionId: id,
          type: 'plan_changed',
          fromStatus: current.status,
          toStatus: current.status,
          fromPlanId: current.planId,
          toPlanId: plan.id,
          actorUserId: actorId,
          createdAt: now,
          payload: {
            mode: 'immediate',
            previousEndDate: current.endDate?.toISOString() ?? null,
            endDate: updated.endDate?.toISOString() ?? null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  async expireDue(): Promise<ExpireDueResult> {
    const now = this.now();
    const expired: ExpireDueResult['expired'] = [];
    for (const candidate of await this.subscriptions.listDueForExpiry(now)) {
      const saved = await this.tx.run(async (tx) => {
        const current = await this.subscriptions.findById(candidate.id, tx, true);
        if (!current || current.status !== 'active' || !current.endDate || current.endDate > now) return null;
        await this.subscriptions.update(current.id, { status: 'expired', nextRenewalAt: null }, tx);
        await this.events.append(
          {
            subscriptionId: current.id,
            type: 'expired',
            fromStatus: 'active',
            toStatus: 'expired',
            actorUserId: null,
            createdAt: now,
            payload: { endDate: current.endDate.toISOString() },
          },
          tx,
        );
        return { id: current.id, memberId: current.memberId, endDate: current.endDate };
      });
      if (saved) expired.push(saved);
    }

    const cutoff = new Date(now.getTime() - this.options.pendingTtlHours * 60 * 60 * 1000);
    const cancelledPendingIds: string[] = [];
    for (const candidate of await this.subscriptions.listStalePending(cutoff)) {
      const saved = await this.tx.run(async (tx) => {
        const current = await this.subscriptions.findById(candidate.id, tx, true);
        if (!current || current.status !== 'pending' || current.createdAt > cutoff) return null;
        await this.subscriptions.update(
          current.id,
          {
            status: 'cancelled',
            cancelledAt: now,
            cancellationReason: 'payment_timeout',
            nextRenewalAt: null,
          },
          tx,
        );
        await this.events.append(
          {
            subscriptionId: current.id,
            type: 'cancelled',
            fromStatus: 'pending',
            toStatus: 'cancelled',
            actorUserId: null,
            createdAt: now,
            payload: { reason: 'payment_timeout' },
          },
          tx,
        );
        return current.id;
      });
      if (saved) cancelledPendingIds.push(saved);
    }
    return { expired, cancelledPendingIds };
  }

  private async activateLocked(id: string, actorId: string, tx: Transaction): Promise<SubscriptionRecord> {
    const current = await this.requireLocked(id, tx);
    assertAction(current.status, 'activate');
    const plan = await this.requirePlan(current.planId, tx);
    const now = this.now();
    const window = activationWindow({
      now,
      plannedStart: current.startDate,
      period: plan.duration,
      timeZone: this.options.timeZone,
      autoRenew: current.autoRenew,
    });
    const updated = await this.subscriptions.update(id, { status: 'active', ...CLEARED_HOLD, ...window }, tx);
    await this.events.append(
      {
        subscriptionId: id,
        type: 'activated',
        fromStatus: 'pending',
        toStatus: 'active',
        toPlanId: plan.id,
        actorUserId: actorId,
        createdAt: now,
        payload: { startDate: window.startDate.toISOString(), endDate: window.endDate.toISOString() },
      },
      tx,
    );
    return updated;
  }

  private async recordPayment(
    subscription: SubscriptionRecord,
    payment: SubscriptionPaymentInput,
    actorId: string,
    now: Date,
    tx: Transaction,
  ): Promise<void> {
    const status = payment.status ?? 'completed';
    if (payment.idempotencyKey) {
      const existing = await this.payments.findByIdempotencyKey(payment.idempotencyKey, tx);
      if (existing) return;
    }
    await this.payments.create(
      {
        subscriptionId: subscription.id,
        memberId: subscription.memberId,
        amount: toMoney(payment.amount ?? subscription.priceAmount),
        currency: subscription.currency,
        method: payment.method,
        status,
        providerReference: payment.reference ?? null,
        idempotencyKey: payment.idempotencyKey ?? null,
        paidAt: status === 'completed' ? now : null,
        notes: payment.notes ?? null,
        recordedBy: actorId,
      },
      tx,
    );
  }

  private async assertRenewedFrom(id: string, memberId: string, tx: Transaction): Promise<void> {
    const previous = await this.subscriptions.findById(id, tx);
    if (!previous || previous.memberId !== memberId) {
      throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Previous subscription not found');
    }
    if (previous.status !== 'expired' && previous.status !== 'cancelled') {
      throw new AppError(409, 'INVALID_STATE', 'A successor can only link an expired or cancelled subscription');
    }
  }

  private async requireActiveMember(id: string, tx: Transaction) {
    const member = await this.members.findById(id, tx, true);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    if (member.status !== 'active') {
      throw new AppError(409, 'MEMBER_NOT_ACTIVE', 'Member is not active');
    }
    return member;
  }

  private async requireActivePlan(id: string, tx: Transaction) {
    const plan = await this.requirePlan(id, tx);
    if (!plan.isActive) throw new AppError(409, 'PLAN_UNAVAILABLE', 'Plan is not active');
    return plan;
  }

  private async requirePlan(id: string, tx: Transaction) {
    const plan = await this.plans.findById(id, tx);
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan not found');
    return plan;
  }

  private async assertReadable(memberId: string, actor: AuthContext): Promise<void> {
    const member = await this.members.findById(memberId);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    assertSelfOrStaff(actor, member.userId);
  }

  private async require(id: string, tx?: Transaction): Promise<SubscriptionRecord> {
    const row = await this.subscriptions.findById(id, tx);
    if (!row) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    return row;
  }

  private async requireLocked(id: string, tx: Transaction): Promise<SubscriptionRecord> {
    const row = await this.subscriptions.findById(id, tx, true);
    if (!row) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    return row;
  }

  private now(): Date {
    return this.options.clock();
  }
}

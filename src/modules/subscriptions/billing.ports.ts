import type { Transaction } from '../../common/transaction';
import type { ListQuery } from '../../common/pagination/pagination';
import type {
  PaymentMethod,
  PaymentStatus,
  SubscriptionEventType,
  SubscriptionStatus,
} from '../../common/types/domain';

export interface SubscriptionRecord {
  id: string;
  memberId: string;
  planId: string;
  scheduledPlanId: string | null;
  renewedFromId: string | null;
  status: SubscriptionStatus;
  startDate: Date | null;
  endDate: Date | null;
  nextRenewalAt: Date | null;
  autoRenew: boolean;
  priceAmount: string;
  currency: string;
  pausedAt: Date | null;
  frozenEndAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionListQuery extends ListQuery {
  status?: SubscriptionStatus;
  memberId?: string;
  planId?: string;
  expiringBefore?: Date;
}

export interface SubscriptionWrite {
  memberId: string;
  planId: string;
  scheduledPlanId?: string | null;
  renewedFromId?: string | null;
  status: SubscriptionStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  nextRenewalAt?: Date | null;
  autoRenew: boolean;
  priceAmount: string;
  currency: string;
  createdBy?: string | null;
  createdAt: Date;
}

export interface SubscriptionPatch {
  planId?: string;
  scheduledPlanId?: string | null;
  renewedFromId?: string | null;
  status?: SubscriptionStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  nextRenewalAt?: Date | null;
  autoRenew?: boolean;
  priceAmount?: string;
  currency?: string;
  pausedAt?: Date | null;
  frozenEndAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
}

export interface SubscriptionRepository {
  findById(id: string, tx?: Transaction, lock?: boolean): Promise<SubscriptionRecord | null>;
  findOpenByMemberId(memberId: string, tx?: Transaction, lock?: boolean): Promise<SubscriptionRecord | null>;
  findAccessible(memberId: string, now: Date, tx?: Transaction): Promise<SubscriptionRecord | null>;
  list(query: SubscriptionListQuery): Promise<{ rows: SubscriptionRecord[]; total: number }>;
  create(input: SubscriptionWrite, tx?: Transaction): Promise<SubscriptionRecord>;
  update(id: string, patch: SubscriptionPatch, tx?: Transaction): Promise<SubscriptionRecord>;
  listDueForExpiry(now: Date): Promise<SubscriptionRecord[]>;
  listStalePending(cutoff: Date): Promise<SubscriptionRecord[]>;
  listActive(now: Date): Promise<SubscriptionRecord[]>;
}

export interface SubscriptionEventRecord {
  id: string;
  subscriptionId: string;
  type: SubscriptionEventType;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus | null;
  fromPlanId: string | null;
  toPlanId: string | null;
  payload: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: Date;
}

export interface SubscriptionEventWrite {
  subscriptionId: string;
  type: SubscriptionEventType;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus | null;
  fromPlanId?: string | null;
  toPlanId?: string | null;
  payload?: Record<string, unknown> | null;
  actorUserId?: string | null;
  createdAt: Date;
}

export interface SubscriptionEventRepository {
  append(input: SubscriptionEventWrite, tx?: Transaction): Promise<SubscriptionEventRecord>;
  listBySubscription(subscriptionId: string): Promise<SubscriptionEventRecord[]>;
  countByTypes(types: SubscriptionEventType[], from: Date, to: Date): Promise<Partial<Record<SubscriptionEventType, number>>>;
}

export interface PaymentRecord {
  id: string;
  subscriptionId: string;
  memberId: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string | null;
  providerReference: string | null;
  idempotencyKey: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentListQuery extends ListQuery {
  memberId?: string;
  subscriptionId?: string;
  status?: PaymentStatus;
  from?: Date;
  to?: Date;
}

export interface PaymentWrite {
  id?: string;
  subscriptionId: string;
  memberId: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider?: string | null;
  providerReference?: string | null;
  idempotencyKey?: string | null;
  paidAt?: Date | null;
  notes?: string | null;
  recordedBy?: string | null;
}

export interface PaymentPatch {
  status?: PaymentStatus;
  provider?: string | null;
  providerReference?: string | null;
  paidAt?: Date | null;
  refundedAt?: Date | null;
}

export interface RevenueRow {
  currency: string;
  gross: string;
  refunds: string;
  net: string;
  payments: number;
}

export interface PaymentRepository {
  findById(id: string, tx?: Transaction, lock?: boolean): Promise<PaymentRecord | null>;
  findByIdempotencyKey(key: string, tx?: Transaction): Promise<PaymentRecord | null>;
  list(query: PaymentListQuery): Promise<{ rows: PaymentRecord[]; total: number }>;
  create(input: PaymentWrite, tx?: Transaction): Promise<PaymentRecord>;
  update(id: string, patch: PaymentPatch, tx?: Transaction): Promise<PaymentRecord>;
  revenue(from: Date, to: Date): Promise<RevenueRow[]>;
}

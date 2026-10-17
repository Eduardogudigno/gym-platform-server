import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { AppError } from '../../common/errors/app-error';
import { definedPatch, readDecimal } from '../../database/values';
import { Subscription } from '../../database/models';
import type {
  SubscriptionListQuery,
  SubscriptionPatch,
  SubscriptionRecord,
  SubscriptionRepository,
  SubscriptionWrite,
} from './billing.ports';

const OPEN_STATUSES = ['pending', 'active', 'paused'] as const;

function toSubscription(row: Subscription): SubscriptionRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    planId: row.planId,
    scheduledPlanId: row.scheduledPlanId,
    renewedFromId: row.renewedFromId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    nextRenewalAt: row.nextRenewalAt,
    autoRenew: row.autoRenew,
    priceAmount: readDecimal(row.priceAmount),
    currency: row.currency,
    pausedAt: row.pausedAt,
    frozenEndAt: row.frozenEndAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function options(tx?: Transaction, lock = false) {
  if (!tx) return {};
  return { transaction: tx, lock: lock ? tx.LOCK.UPDATE : undefined };
}

export class SequelizeSubscriptionRepository implements SubscriptionRepository {
  async findById(id: string, tx?: Transaction, lock = false): Promise<SubscriptionRecord | null> {
    const row = await Subscription.findByPk(id, options(tx, lock));
    return row ? toSubscription(row) : null;
  }

  async findOpenByMemberId(memberId: string, tx?: Transaction, lock = false): Promise<SubscriptionRecord | null> {
    const row = await Subscription.findOne({
      where: { memberId, status: { [Op.in]: OPEN_STATUSES } },
      ...options(tx, lock),
    });
    return row ? toSubscription(row) : null;
  }

  async findAccessible(memberId: string, now: Date, tx?: Transaction): Promise<SubscriptionRecord | null> {
    const row = await Subscription.findOne({
      where: {
        memberId,
        status: 'active',
        startDate: { [Op.lte]: now },
        endDate: { [Op.gt]: now },
      },
      transaction: tx,
    });
    return row ? toSubscription(row) : null;
  }

  async list(query: SubscriptionListQuery): Promise<{ rows: SubscriptionRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.status) where.status = query.status;
    if (query.memberId) where.memberId = query.memberId;
    if (query.planId) where.planId = query.planId;
    if (query.expiringBefore) where.endDate = { [Op.lte]: query.expiringBefore };
    const result = await Subscription.findAndCountAll({
      where,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [[query.sortBy, query.sortDir]],
    });
    return { rows: result.rows.map(toSubscription), total: result.count };
  }

  async create(input: SubscriptionWrite, tx?: Transaction): Promise<SubscriptionRecord> {
    const row = await Subscription.create(
      {
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
        createdBy: input.createdBy ?? null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      { transaction: tx },
    );
    return toSubscription(row);
  }

  async update(id: string, patch: SubscriptionPatch, tx?: Transaction): Promise<SubscriptionRecord> {
    const row = await Subscription.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    await row.update(definedPatch(patch), { transaction: tx });
    return toSubscription(row);
  }

  async listDueForExpiry(now: Date): Promise<SubscriptionRecord[]> {
    const rows = await Subscription.findAll({
      where: { status: 'active', endDate: { [Op.lte]: now } },
    });
    return rows.map(toSubscription);
  }

  async listStalePending(cutoff: Date): Promise<SubscriptionRecord[]> {
    const rows = await Subscription.findAll({
      where: { status: 'pending', createdAt: { [Op.lte]: cutoff } },
    });
    return rows.map(toSubscription);
  }

  async listActive(now: Date): Promise<SubscriptionRecord[]> {
    const rows = await Subscription.findAll({
      where: { status: 'active', endDate: { [Op.gt]: now } },
    });
    return rows.map(toSubscription);
  }
}

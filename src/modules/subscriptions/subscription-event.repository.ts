import { Op, col, fn, type Transaction } from 'sequelize';
import { SubscriptionEvent } from '../../database/models';
import type {
  SubscriptionEventRecord,
  SubscriptionEventRepository,
  SubscriptionEventWrite,
} from './billing.ports';
import type { SubscriptionEventType } from '../../common/types/domain';

function toEvent(row: SubscriptionEvent): SubscriptionEventRecord {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromPlanId: row.fromPlanId,
    toPlanId: row.toPlanId,
    payload: row.payload,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt,
  };
}

export class SequelizeSubscriptionEventRepository implements SubscriptionEventRepository {
  async append(input: SubscriptionEventWrite, tx?: Transaction): Promise<SubscriptionEventRecord> {
    const row = await SubscriptionEvent.create(
      {
        subscriptionId: input.subscriptionId,
        type: input.type,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        fromPlanId: input.fromPlanId ?? null,
        toPlanId: input.toPlanId ?? null,
        payload: input.payload ?? null,
        actorUserId: input.actorUserId ?? null,
        createdAt: input.createdAt,
      },
      { transaction: tx },
    );
    return toEvent(row);
  }

  async listBySubscription(subscriptionId: string): Promise<SubscriptionEventRecord[]> {
    const rows = await SubscriptionEvent.findAll({
      where: { subscriptionId },
      order: [['createdAt', 'ASC']],
    });
    return rows.map(toEvent);
  }

  async countByTypes(
    types: SubscriptionEventType[],
    from: Date,
    to: Date,
  ): Promise<Partial<Record<SubscriptionEventType, number>>> {
    const rows = (await SubscriptionEvent.findAll({
      attributes: ['type', [fn('COUNT', col('id')), 'total']],
      where: { type: { [Op.in]: types }, createdAt: { [Op.gte]: from, [Op.lte]: to } },
      group: ['type'],
      raw: true,
    })) as unknown as Array<{ type: SubscriptionEventType; total: string | number }>;
    const counts: Partial<Record<SubscriptionEventType, number>> = {};
    for (const row of rows) counts[row.type] = Number(row.total);
    return counts;
  }
}

import { UniqueConstraintError, type Transaction, type WhereOptions } from 'sequelize';
import { AppError } from '../../common/errors/app-error';
import type { ListQuery } from '../../common/pagination/pagination';
import type { ReminderStatus, ReminderType } from '../../common/types/domain';
import { SubscriptionReminder } from '../../database/models';

export interface ReminderRecord {
  id: string;
  subscriptionId: string;
  type: ReminderType;
  periodEnd: Date;
  status: ReminderStatus;
  scheduledFor: Date;
  sentAt: Date | null;
  createdAt: Date;
}

export interface ReminderListQuery extends ListQuery {
  subscriptionId?: string;
  type?: ReminderType;
  status?: ReminderStatus;
}

export interface ReminderRepository {
  list(query: ReminderListQuery): Promise<{ rows: ReminderRecord[]; total: number }>;
  createIfAbsent(
    input: {
      subscriptionId: string;
      type: ReminderType;
      periodEnd: Date;
      scheduledFor: Date;
      status: ReminderStatus;
    },
    tx?: Transaction,
  ): Promise<ReminderRecord | null>;
  mark(id: string, status: ReminderStatus, sentAt: Date | null): Promise<void>;
}

function toReminder(row: SubscriptionReminder): ReminderRecord {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    type: row.type,
    periodEnd: row.periodEnd,
    status: row.status,
    scheduledFor: row.scheduledFor,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

export class SequelizeReminderRepository implements ReminderRepository {
  async list(query: ReminderListQuery): Promise<{ rows: ReminderRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.subscriptionId) where.subscriptionId = query.subscriptionId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    const result = await SubscriptionReminder.findAndCountAll({
      where,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [[query.sortBy, query.sortDir]],
    });
    return { rows: result.rows.map(toReminder), total: result.count };
  }

  async createIfAbsent(
    input: {
      subscriptionId: string;
      type: ReminderType;
      periodEnd: Date;
      scheduledFor: Date;
      status: ReminderStatus;
    },
    tx?: Transaction,
  ): Promise<ReminderRecord | null> {
    try {
      const row = await SubscriptionReminder.create(input, { transaction: tx });
      return toReminder(row);
    } catch (error) {
      if (error instanceof UniqueConstraintError) return null;
      throw error;
    }
  }

  async mark(id: string, status: ReminderStatus, sentAt: Date | null): Promise<void> {
    const row = await SubscriptionReminder.findByPk(id);
    if (!row) throw new AppError(404, 'REMINDER_NOT_FOUND', 'Reminder not found');
    await row.update({ status, sentAt });
  }
}

import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { CheckIn } from '../../database/models';
import type { CheckInSource } from '../../common/types/domain';
import type { ListQuery } from '../../common/pagination/pagination';

export interface CheckInRecord {
  id: string;
  memberId: string;
  subscriptionId: string;
  checkedInAt: Date;
  source: CheckInSource;
  notes: string | null;
  recordedBy: string | null;
  createdAt: Date;
}

export interface CheckInListQuery extends ListQuery {
  memberId?: string;
  from?: Date;
  to?: Date;
}

export interface CheckInRepository {
  findById(id: string): Promise<CheckInRecord | null>;
  list(query: CheckInListQuery): Promise<{ rows: CheckInRecord[]; total: number }>;
  create(
    input: {
      memberId: string;
      subscriptionId: string;
      checkedInAt: Date;
      source: CheckInSource;
      notes?: string | null;
      recordedBy?: string | null;
    },
    tx?: Transaction,
  ): Promise<CheckInRecord>;
}

function toCheckIn(row: CheckIn): CheckInRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    subscriptionId: row.subscriptionId,
    checkedInAt: row.checkedInAt,
    source: row.source,
    notes: row.notes,
    recordedBy: row.recordedBy,
    createdAt: row.createdAt,
  };
}

export class SequelizeCheckInRepository implements CheckInRepository {
  async findById(id: string): Promise<CheckInRecord | null> {
    const row = await CheckIn.findByPk(id);
    return row ? toCheckIn(row) : null;
  }

  async list(query: CheckInListQuery): Promise<{ rows: CheckInRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.memberId) where.memberId = query.memberId;
    if (query.from || query.to) {
      where.checkedInAt = {
        ...(query.from ? { [Op.gte]: query.from } : {}),
        ...(query.to ? { [Op.lte]: query.to } : {}),
      };
    }
    const result = await CheckIn.findAndCountAll({
      where,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [[query.sortBy, query.sortDir]],
    });
    return { rows: result.rows.map(toCheckIn), total: result.count };
  }

  async create(
    input: {
      memberId: string;
      subscriptionId: string;
      checkedInAt: Date;
      source: CheckInSource;
      notes?: string | null;
      recordedBy?: string | null;
    },
    tx?: Transaction,
  ): Promise<CheckInRecord> {
    const row = await CheckIn.create(
      {
        memberId: input.memberId,
        subscriptionId: input.subscriptionId,
        checkedInAt: input.checkedInAt,
        source: input.source,
        notes: input.notes ?? null,
        recordedBy: input.recordedBy ?? null,
      },
      { transaction: tx },
    );
    return toCheckIn(row);
  }
}

import type { Transaction, WhereOptions } from 'sequelize';
import { AppError } from '../../common/errors/app-error';
import { definedPatch, readBenefits, readDecimal } from '../../database/values';
import { MembershipPlan } from '../../database/models';
import type { PlanListQuery, PlanRecord, PlanRepository, PlanWrite } from './plan.ports';

function toPlan(row: MembershipPlan): PlanRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: readDecimal(row.price),
    currency: row.currency,
    duration: row.duration,
    benefits: readBenefits(row.benefits),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SequelizePlanRepository implements PlanRepository {
  async findById(id: string, tx?: Transaction): Promise<PlanRecord | null> {
    const row = await MembershipPlan.findByPk(id, { transaction: tx });
    return row ? toPlan(row) : null;
  }

  async list(query: PlanListQuery): Promise<{ rows: PlanRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    const result = await MembershipPlan.findAndCountAll({
      where,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [[query.sortBy, query.sortDir]],
    });
    return { rows: result.rows.map(toPlan), total: result.count };
  }

  async create(input: PlanWrite, tx?: Transaction): Promise<PlanRecord> {
    const row = await MembershipPlan.create(
      {
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        currency: input.currency,
        duration: input.duration,
        benefits: input.benefits ?? [],
        isActive: input.isActive ?? true,
      },
      { transaction: tx },
    );
    return toPlan(row);
  }

  async update(id: string, patch: Partial<PlanWrite>, tx?: Transaction): Promise<PlanRecord> {
    const row = await MembershipPlan.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan not found');
    await row.update(definedPatch(patch), { transaction: tx });
    return toPlan(row);
  }

  async softDelete(id: string, tx?: Transaction): Promise<void> {
    const row = await MembershipPlan.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan not found');
    await row.destroy({ transaction: tx });
  }
}

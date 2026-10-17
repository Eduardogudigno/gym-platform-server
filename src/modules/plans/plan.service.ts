import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money';
import { env } from '../../config/env';
import type { AuthContext } from '../../common/types/auth';
import type { BillingPeriod } from '../../common/types/domain';
import type { PlanListQuery, PlanRecord, PlanRepository, PlanWrite } from './plan.ports';

export interface PlanInput {
  name: string;
  description?: string | null;
  price: string | number;
  currency?: string;
  duration: BillingPeriod;
  benefits?: string[];
  isActive?: boolean;
}

export class PlanService {
  constructor(private readonly plans: PlanRepository) {}

  list(query: PlanListQuery, actor: AuthContext): Promise<{ rows: PlanRecord[]; total: number }> {
    const isActive = actor.role === 'member' ? true : query.isActive;
    return this.plans.list({ ...query, ...(isActive === undefined ? {} : { isActive }) });
  }

  async get(id: string, actor: AuthContext): Promise<PlanRecord> {
    const plan = await this.require(id);
    if (actor.role === 'member' && !plan.isActive) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan not found');
    return plan;
  }

  create(input: PlanInput): Promise<PlanRecord> {
    return this.plans.create(this.normalize(input));
  }

  async update(id: string, input: Partial<PlanInput>): Promise<PlanRecord> {
    await this.require(id);
    const patch: Partial<PlanWrite> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.price !== undefined) patch.price = toMoney(input.price);
    if (input.currency !== undefined) patch.currency = input.currency.toUpperCase();
    if (input.duration !== undefined) patch.duration = input.duration;
    if (input.benefits !== undefined) patch.benefits = input.benefits;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    return this.plans.update(id, patch);
  }

  async setStatus(id: string, isActive: boolean): Promise<PlanRecord> {
    await this.require(id);
    return this.plans.update(id, { isActive });
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.plans.softDelete(id);
  }

  private normalize(input: PlanInput): PlanWrite {
    return {
      name: input.name,
      description: input.description ?? null,
      price: toMoney(input.price),
      currency: (input.currency ?? env.defaultCurrency).toUpperCase(),
      duration: input.duration,
      benefits: input.benefits ?? [],
      isActive: input.isActive ?? true,
    };
  }

  private async require(id: string): Promise<PlanRecord> {
    const plan = await this.plans.findById(id);
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan not found');
    return plan;
  }
}

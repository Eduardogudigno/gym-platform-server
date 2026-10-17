import type { Transaction } from '../../common/transaction';
import type { ListQuery } from '../../common/pagination/pagination';
import type { BillingPeriod } from '../../common/types/domain';

export interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  duration: BillingPeriod;
  benefits: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanListQuery extends ListQuery {
  isActive?: boolean;
}

export interface PlanWrite {
  name: string;
  description?: string | null;
  price: string;
  currency: string;
  duration: BillingPeriod;
  benefits?: string[];
  isActive?: boolean;
}

export interface PlanRepository {
  findById(id: string, tx?: Transaction): Promise<PlanRecord | null>;
  list(query: PlanListQuery): Promise<{ rows: PlanRecord[]; total: number }>;
  create(input: PlanWrite, tx?: Transaction): Promise<PlanRecord>;
  update(id: string, patch: Partial<PlanWrite>, tx?: Transaction): Promise<PlanRecord>;
  softDelete(id: string, tx?: Transaction): Promise<void>;
}

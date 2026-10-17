import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { UniqueConstraintError } from 'sequelize';
import { AppError } from '../../common/errors/app-error';
import { fromCents, toCents } from '../../common/money';
import { definedPatch, readDecimal } from '../../database/values';
import { sequelize } from '../../database/models';
import { Payment } from '../../database/models';
import type {
  PaymentListQuery,
  PaymentPatch,
  PaymentRecord,
  PaymentRepository,
  PaymentWrite,
  RevenueRow,
} from '../subscriptions/billing.ports';

function toPayment(row: Payment): PaymentRecord {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    memberId: row.memberId,
    amount: readDecimal(row.amount),
    currency: row.currency,
    method: row.method,
    status: row.status,
    provider: row.provider,
    providerReference: row.providerReference,
    idempotencyKey: row.idempotencyKey,
    paidAt: row.paidAt,
    refundedAt: row.refundedAt,
    notes: row.notes,
    recordedBy: row.recordedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SequelizePaymentRepository implements PaymentRepository {
  async findById(id: string, tx?: Transaction, lock = false): Promise<PaymentRecord | null> {
    const row = await Payment.findByPk(id, {
      transaction: tx,
      lock: lock && tx ? tx.LOCK.UPDATE : undefined,
    });
    return row ? toPayment(row) : null;
  }

  async findByIdempotencyKey(key: string, tx?: Transaction): Promise<PaymentRecord | null> {
    const row = await Payment.findOne({ where: { idempotencyKey: key }, transaction: tx });
    return row ? toPayment(row) : null;
  }

  async list(query: PaymentListQuery): Promise<{ rows: PaymentRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.memberId) where.memberId = query.memberId;
    if (query.subscriptionId) where.subscriptionId = query.subscriptionId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.paidAt = {
        ...(query.from ? { [Op.gte]: query.from } : {}),
        ...(query.to ? { [Op.lte]: query.to } : {}),
      };
    }
    const result = await Payment.findAndCountAll({
      where,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [[query.sortBy, query.sortDir]],
    });
    return { rows: result.rows.map(toPayment), total: result.count };
  }

  async create(input: PaymentWrite, tx?: Transaction): Promise<PaymentRecord> {
    try {
      const row = await Payment.create(
        {
          ...(input.id ? { id: input.id } : {}),
          subscriptionId: input.subscriptionId,
          memberId: input.memberId,
          amount: input.amount,
          currency: input.currency,
          method: input.method,
          status: input.status,
          provider: input.provider ?? null,
          providerReference: input.providerReference ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          paidAt: input.paidAt ?? null,
          notes: input.notes ?? null,
          recordedBy: input.recordedBy ?? null,
        },
        { transaction: tx },
      );
      return toPayment(row);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used');
      }
      throw error;
    }
  }

  async update(id: string, patch: PaymentPatch, tx?: Transaction): Promise<PaymentRecord> {
    const row = await Payment.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    await row.update(definedPatch(patch), { transaction: tx });
    return toPayment(row);
  }

  async revenue(from: Date, to: Date): Promise<RevenueRow[]> {
    const [rows] = await sequelize.query(
      `SELECT currency,
              COALESCE(SUM(CASE WHEN status IN ('completed', 'refunded') AND paid_at >= :from AND paid_at <= :to THEN amount ELSE 0 END), 0) AS gross,
              COALESCE(SUM(CASE WHEN status = 'refunded' AND refunded_at >= :from AND refunded_at <= :to THEN amount ELSE 0 END), 0) AS refunds,
              COALESCE(SUM(CASE WHEN status IN ('completed', 'refunded') AND paid_at >= :from AND paid_at <= :to THEN 1 ELSE 0 END), 0) AS payments
       FROM payments
       GROUP BY currency`,
      { replacements: { from, to } },
    );
    return (rows as Array<{ currency: string; gross: string | number; refunds: string | number; payments: string | number }>)
      .filter((row) => row.currency)
      .map((row) => {
        const gross = readDecimal(row.gross);
        const refunds = readDecimal(row.refunds);
        return {
          currency: row.currency,
          gross,
          refunds,
          net: fromCents(toCents(gross) - toCents(refunds)),
          payments: Number(row.payments),
        };
      });
  }
}

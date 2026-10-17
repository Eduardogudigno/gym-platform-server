import { Op, type WhereOptions } from 'sequelize';
import { Member, Subscription, User } from '../../database/models';
import type { ListQuery } from '../../common/pagination/pagination';
import { computeRenewalRate } from '../subscriptions/subscription.policy';
import type { SubscriptionEventRepository, PaymentRepository } from '../subscriptions/billing.ports';

export interface ActiveMemberRow {
  memberId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  subscriptionId: string;
  planId: string;
  endDate: Date | null;
}

export interface ExpiringRow {
  subscriptionId: string;
  memberId: string;
  planId: string;
  endDate: Date | null;
  email: string;
  firstName: string;
  lastName: string;
}

export class ReportService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly events: SubscriptionEventRepository,
  ) {}

  async activeMembers(query: ListQuery, now: Date): Promise<{ rows: ActiveMemberRow[]; total: number }> {
    const result = await Member.findAndCountAll({
      where: { status: 'active' },
      include: [
        { model: User, required: true },
        {
          model: Subscription,
          required: true,
          where: { status: 'active', startDate: { [Op.lte]: now }, endDate: { [Op.gt]: now } },
        },
      ],
      distinct: true,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [['createdAt', query.sortDir]],
    });
    return {
      total: result.count,
      rows: result.rows.map((member) => {
        const subscription = member.subscriptions?.[0];
        return {
          memberId: member.id,
          userId: member.userId,
          email: member.user?.email ?? '',
          firstName: member.user?.firstName ?? '',
          lastName: member.user?.lastName ?? '',
          subscriptionId: subscription?.id ?? '',
          planId: subscription?.planId ?? '',
          endDate: subscription?.endDate ?? null,
        };
      }),
    };
  }

  async expiring(withinDays: number, query: ListQuery, now: Date): Promise<{ rows: ExpiringRow[]; total: number }> {
    const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    const where: WhereOptions = {
      status: 'active',
      endDate: { [Op.gt]: now, [Op.lte]: until },
    };
    const result = await Subscription.findAndCountAll({
      where,
      include: [{ model: Member, required: true, include: [{ model: User, required: true }] }],
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [['endDate', 'ASC']],
    });
    return {
      total: result.count,
      rows: result.rows.map((subscription) => ({
        subscriptionId: subscription.id,
        memberId: subscription.memberId,
        planId: subscription.planId,
        endDate: subscription.endDate,
        email: subscription.member?.user?.email ?? '',
        firstName: subscription.member?.user?.firstName ?? '',
        lastName: subscription.member?.user?.lastName ?? '',
      })),
    };
  }

  async revenue(from: Date, to: Date) {
    const totals = await this.payments.revenue(from, to);
    return { from, to, totals };
  }

  async renewalRate(from: Date, to: Date) {
    const counts = await this.events.countByTypes(['renewed', 'expired', 'cancelled'], from, to);
    return {
      from,
      to,
      ...computeRenewalRate({
        renewed: counts.renewed ?? 0,
        expired: counts.expired ?? 0,
        cancelled: counts.cancelled ?? 0,
      }),
    };
  }
}

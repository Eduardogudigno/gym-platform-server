import { logger } from '../../config/logger';
import type { Mailer } from '../notifications/mailer';
import type { MemberRepository } from '../members/member.ports';
import type { SubscriptionRepository } from '../subscriptions/billing.ports';
import { dueReminderTypes } from '../subscriptions/subscription.policy';
import type { ReminderListQuery, ReminderRecord, ReminderRepository } from './reminder.repository';

export class ReminderService {
  constructor(
    private readonly reminders: ReminderRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members: MemberRepository,
    private readonly mailer: Mailer,
    private readonly thresholds: number[],
    private readonly clock: () => Date,
  ) {}

  list(query: ReminderListQuery): Promise<{ rows: ReminderRecord[]; total: number }> {
    return this.reminders.list(query);
  }

  async generate(): Promise<{ created: number }> {
    const now = this.clock();
    const active = await this.subscriptions.listActive(now);
    let created = 0;
    for (const subscription of active) {
      if (!subscription.endDate) continue;
      const types = dueReminderTypes(now, subscription.endDate, this.thresholds);
      for (const type of types) {
        const row = await this.reminders.createIfAbsent({
          subscriptionId: subscription.id,
          type,
          periodEnd: subscription.endDate,
          scheduledFor: now,
          status: 'pending',
        });
        if (!row) continue;
        created += 1;
        await this.dispatch(row, subscription.memberId);
      }
    }
    return { created };
  }

  async notifyExpired(items: Array<{ id: string; memberId: string; endDate: Date }>): Promise<{ created: number }> {
    const now = this.clock();
    let created = 0;
    for (const item of items) {
      const row = await this.reminders.createIfAbsent({
        subscriptionId: item.id,
        type: 'expired',
        periodEnd: item.endDate,
        scheduledFor: now,
        status: 'pending',
      });
      if (!row) continue;
      created += 1;
      await this.dispatch(row, item.memberId);
    }
    return { created };
  }

  private async dispatch(reminder: ReminderRecord, memberId: string): Promise<void> {
    try {
      const member = await this.members.findById(memberId);
      if (!member) throw new Error('Member not found for reminder');
      await this.mailer.send({
        to: member.email,
        subject: `Subscription ${reminder.type}`,
        text: `Subscription ${reminder.subscriptionId} reminder ${reminder.type} for period ending ${reminder.periodEnd.toISOString()}.`,
      });
      await this.reminders.mark(reminder.id, 'sent', this.clock());
    } catch (error) {
      logger.error({ err: error, reminderId: reminder.id }, 'reminder delivery failed');
      await this.reminders.mark(reminder.id, 'failed', null);
    }
  }
}

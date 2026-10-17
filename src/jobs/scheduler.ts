import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { ReminderService } from '../modules/reminders/reminder.service';
import type { SubscriptionService } from '../modules/subscriptions/subscription.service';

export async function runSubscriptionJobs(
  subscriptions: SubscriptionService,
  reminders: ReminderService,
): Promise<{
  expired: number;
  cancelledPending: number;
  expiredReminders: number;
  upcomingReminders: number;
}> {
  const expired = await subscriptions.expireDue();
  const expiredReminders = await reminders.notifyExpired(expired.expired);
  const upcoming = await reminders.generate();
  return {
    expired: expired.expired.length,
    cancelledPending: expired.cancelledPendingIds.length,
    expiredReminders: expiredReminders.created,
    upcomingReminders: upcoming.created,
  };
}

export function startScheduler(task: () => Promise<void>): void {
  if (!env.enableCron) return;
  cron.schedule(env.cronSchedule, () => {
    task().catch((error: unknown) => logger.error({ err: error }, 'subscription job failed'));
  });
  logger.info({ schedule: env.cronSchedule }, 'subscription scheduler started');
}

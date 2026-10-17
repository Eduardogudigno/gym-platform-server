import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { AppError } from '../../common/errors/app-error';
import type { BillingPeriod, ReminderType, SubscriptionStatus } from '../../common/types/domain';

dayjs.extend(utc);
dayjs.extend(timezone);

const MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export type SubscriptionAction = 'activate' | 'renew' | 'pause' | 'resume' | 'cancel' | 'change_plan';

const ALLOWED: Record<SubscriptionAction, readonly SubscriptionStatus[]> = {
  activate: ['pending'],
  renew: ['active', 'expired'],
  pause: ['active'],
  resume: ['paused'],
  cancel: ['pending', 'active', 'paused'],
  change_plan: ['pending', 'active'],
};

export interface PeriodWindow {
  startDate: Date;
  endDate: Date;
  nextRenewalAt: Date | null;
}

export function addBillingPeriod(start: Date, period: BillingPeriod, timeZone: string): Date {
  return dayjs(start).tz(timeZone).add(MONTHS[period], 'month').toDate();
}

export function assertAction(status: SubscriptionStatus, action: SubscriptionAction): void {
  if (!ALLOWED[action].includes(status)) {
    throw new AppError(409, 'INVALID_STATE', `Cannot ${action} a subscription in status ${status}`);
  }
}

export function activationWindow(input: {
  now: Date;
  plannedStart: Date | null;
  period: BillingPeriod;
  timeZone: string;
  autoRenew: boolean;
}): PeriodWindow {
  const startDate = input.plannedStart && input.plannedStart > input.now ? input.plannedStart : input.now;
  const endDate = addBillingPeriod(startDate, input.period, input.timeZone);
  return { startDate, endDate, nextRenewalAt: input.autoRenew ? endDate : null };
}

export function renewalWindow(input: {
  now: Date;
  currentStart: Date | null;
  currentEnd: Date;
  period: BillingPeriod;
  timeZone: string;
  autoRenew: boolean;
}): PeriodWindow {
  if (input.currentEnd > input.now) {
    const endDate = addBillingPeriod(input.currentEnd, input.period, input.timeZone);
    return {
      startDate: input.currentStart ?? input.currentEnd,
      endDate,
      nextRenewalAt: input.autoRenew ? endDate : null,
    };
  }
  const startDate = input.now;
  const endDate = addBillingPeriod(startDate, input.period, input.timeZone);
  return { startDate, endDate, nextRenewalAt: input.autoRenew ? endDate : null };
}

export function immediatePlanWindow(input: {
  now: Date;
  period: BillingPeriod;
  timeZone: string;
  autoRenew: boolean;
}): PeriodWindow {
  const endDate = addBillingPeriod(input.now, input.period, input.timeZone);
  return { startDate: input.now, endDate, nextRenewalAt: input.autoRenew ? endDate : null };
}

export function resumeWindow(input: {
  now: Date;
  pausedAt: Date;
  frozenEndAt: Date;
  autoRenew: boolean;
}): { endDate: Date; nextRenewalAt: Date | null } {
  const pausedMs = input.now.getTime() - input.pausedAt.getTime();
  if (pausedMs < 0) {
    throw new AppError(409, 'INVALID_STATE', 'Pause time is in the future');
  }
  const endDate = new Date(input.frozenEndAt.getTime() + pausedMs);
  return { endDate, nextRenewalAt: input.autoRenew ? endDate : null };
}

const REMINDER_BY_DAY: Record<number, ReminderType> = {
  7: 'expiring_7d',
  3: 'expiring_3d',
  1: 'expiring_1d',
};

export function dueReminderTypes(now: Date, endDate: Date, thresholds: readonly number[]): ReminderType[] {
  const remaining = endDate.getTime() - now.getTime();
  if (remaining <= 0) return [];
  const dayMs = 24 * 60 * 60 * 1000;
  return thresholds
    .filter((days) => REMINDER_BY_DAY[days] !== undefined && remaining <= days * dayMs)
    .map((days) => REMINDER_BY_DAY[days] as ReminderType);
}

export function computeRenewalRate(input: { renewed: number; expired: number; cancelled: number }): {
  renewed: number;
  expired: number;
  cancelled: number;
  denominator: number;
  rate: number | null;
} {
  const denominator = input.renewed + input.expired + input.cancelled;
  if (denominator === 0) return { ...input, denominator, rate: null };
  return { ...input, denominator, rate: Number((input.renewed / denominator).toFixed(4)) };
}

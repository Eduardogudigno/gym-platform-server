import type { MemberStatus } from '../../common/types/domain';
import type { SubscriptionStatus } from '../../common/types/domain';

export type CheckInDenial =
  | 'MEMBER_NOT_ACTIVE'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'SUBSCRIPTION_NOT_STARTED'
  | 'SUBSCRIPTION_EXPIRED';

export function evaluateCheckIn(input: {
  memberStatus: MemberStatus;
  subscription: { status: SubscriptionStatus; startDate: Date | null; endDate: Date | null } | null;
  now: Date;
}): { allowed: true } | { allowed: false; reason: CheckInDenial } {
  if (input.memberStatus !== 'active') return { allowed: false, reason: 'MEMBER_NOT_ACTIVE' };
  const subscription = input.subscription;
  if (!subscription || subscription.status !== 'active' || !subscription.startDate || !subscription.endDate) {
    return { allowed: false, reason: 'NO_ACTIVE_SUBSCRIPTION' };
  }
  if (subscription.startDate > input.now) return { allowed: false, reason: 'SUBSCRIPTION_NOT_STARTED' };
  if (subscription.endDate <= input.now) return { allowed: false, reason: 'SUBSCRIPTION_EXPIRED' };
  return { allowed: true };
}

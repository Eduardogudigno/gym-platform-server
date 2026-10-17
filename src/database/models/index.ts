import 'reflect-metadata';
import { sequelize } from '../../config/database';
import { CheckIn } from './check-in.model';
import { Member } from './member.model';
import { MembershipPlan } from './membership-plan.model';
import { PasswordResetToken } from './password-reset-token.model';
import { Payment } from './payment.model';
import { RefreshToken } from './refresh-token.model';
import { SubscriptionEvent } from './subscription-event.model';
import { SubscriptionReminder } from './subscription-reminder.model';
import { Subscription } from './subscription.model';
import { User } from './user.model';

sequelize.addModels([
  User,
  RefreshToken,
  PasswordResetToken,
  Member,
  MembershipPlan,
  Subscription,
  SubscriptionEvent,
  Payment,
  CheckIn,
  SubscriptionReminder,
]);

export {
  CheckIn,
  Member,
  MembershipPlan,
  PasswordResetToken,
  Payment,
  RefreshToken,
  Subscription,
  SubscriptionEvent,
  SubscriptionReminder,
  User,
  sequelize,
};

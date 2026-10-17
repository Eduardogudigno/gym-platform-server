import bcrypt from 'bcrypt';
import { env } from '../../config/env';
import {
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
} from '../models';
import { addBillingPeriod } from '../../modules/subscriptions/subscription.policy';

export const SEED_IDS = {
  admin: '11111111-1111-4111-8111-111111111111',
  memberUser: '22222222-2222-4222-8222-222222222222',
  member: '33333333-3333-4333-8333-333333333333',
  monthly: '44444444-4444-4444-8444-444444444444',
  quarterly: '55555555-5555-4555-8555-555555555555',
  yearly: '66666666-6666-4666-8666-666666666666',
  subscription: '77777777-7777-4777-8777-777777777777',
  payment: '88888888-8888-4888-8888-888888888888',
};

export async function up(): Promise<void> {
  const passwordHash = await bcrypt.hash(env.seedAdminPassword, env.bcryptRounds);
  const admin = await User.findByPk(SEED_IDS.admin);
  if (!admin) {
    await User.create({
      id: SEED_IDS.admin,
      email: env.seedAdminEmail,
      passwordHash,
      role: 'admin',
      status: 'active',
      firstName: env.seedAdminFirstName,
      lastName: env.seedAdminLastName,
    });
  }

  if (env.nodeEnv === 'production') return;

  const demoPassword = await bcrypt.hash(env.seedDemoPassword, env.bcryptRounds);
  if (!(await User.findByPk(SEED_IDS.memberUser))) {
    await User.create({
      id: SEED_IDS.memberUser,
      email: 'member@gym.local',
      passwordHash: demoPassword,
      role: 'member',
      status: 'active',
      firstName: 'Ana',
      lastName: 'Paz',
      phone: '+1-555-0100',
    });
  }
  if (!(await Member.findByPk(SEED_IDS.member))) {
    await Member.create({
      id: SEED_IDS.member,
      userId: SEED_IDS.memberUser,
      status: 'active',
      emergencyContactName: 'Luis Paz',
      emergencyContactPhone: '+1-555-0199',
      emergencyContactRelationship: 'brother',
      city: 'Demo City',
    });
  }

  const plans = [
    { id: SEED_IDS.monthly, name: 'Monthly', price: '39.99', duration: 'monthly' as const, benefits: ['Gym floor', 'Locker'] },
    { id: SEED_IDS.quarterly, name: 'Quarterly', price: '99.99', duration: 'quarterly' as const, benefits: ['Gym floor', 'Locker', 'One guest pass'] },
    { id: SEED_IDS.yearly, name: 'Yearly', price: '349.99', duration: 'yearly' as const, benefits: ['Gym floor', 'Locker', 'Guest passes', 'Towel service'] },
  ];
  for (const plan of plans) {
    if (!(await MembershipPlan.findByPk(plan.id))) {
      await MembershipPlan.create({
        ...plan,
        currency: env.defaultCurrency,
        description: `${plan.name} membership`,
        isActive: true,
      });
    }
  }

  if (!(await Subscription.findByPk(SEED_IDS.subscription))) {
    const start = new Date();
    const end = addBillingPeriod(start, 'monthly', env.businessTimezone);
    await Subscription.create({
      id: SEED_IDS.subscription,
      memberId: SEED_IDS.member,
      planId: SEED_IDS.monthly,
      status: 'active',
      startDate: start,
      endDate: end,
      nextRenewalAt: null,
      autoRenew: false,
      priceAmount: '39.99',
      currency: env.defaultCurrency,
      createdBy: SEED_IDS.admin,
    });
    await SubscriptionEvent.create({
      subscriptionId: SEED_IDS.subscription,
      type: 'activated',
      fromStatus: 'pending',
      toStatus: 'active',
      toPlanId: SEED_IDS.monthly,
      actorUserId: SEED_IDS.admin,
      payload: { source: 'seed' },
    });
    await Payment.create({
      id: SEED_IDS.payment,
      subscriptionId: SEED_IDS.subscription,
      memberId: SEED_IDS.member,
      amount: '39.99',
      currency: env.defaultCurrency,
      method: 'cash',
      status: 'completed',
      providerReference: 'SEED-RECEIPT-1',
      paidAt: start,
      recordedBy: SEED_IDS.admin,
    });
  }
}

export async function down(): Promise<void> {
  await Payment.destroy({ where: { id: SEED_IDS.payment }, force: true });
  await SubscriptionEvent.destroy({ where: { subscriptionId: SEED_IDS.subscription } });
  await SubscriptionReminder.destroy({ where: { subscriptionId: SEED_IDS.subscription } });
  await CheckIn.destroy({ where: { subscriptionId: SEED_IDS.subscription } });
  await Subscription.destroy({ where: { id: SEED_IDS.subscription } });
  await MembershipPlan.destroy({ where: { id: [SEED_IDS.monthly, SEED_IDS.quarterly, SEED_IDS.yearly] }, force: true });
  await Member.destroy({ where: { id: SEED_IDS.member }, force: true });
  await PasswordResetToken.destroy({ where: { userId: [SEED_IDS.admin, SEED_IDS.memberUser] } });
  await RefreshToken.destroy({ where: { userId: [SEED_IDS.admin, SEED_IDS.memberUser] } });
  await User.destroy({ where: { id: [SEED_IDS.admin, SEED_IDS.memberUser] }, force: true });
}

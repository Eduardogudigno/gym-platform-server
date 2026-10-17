import 'reflect-metadata';
import { env } from './config/env';
import { SequelizeTransactionRunner } from './database/transaction-runner';
import { AuthController, authRoutes } from './modules/auth/auth.http';
import { AuthService } from './modules/auth/auth.service';
import { SequelizeTokenRepository } from './modules/auth/token.repository';
import { AttendanceController, attendanceRoutes } from './modules/attendance/attendance.http';
import { AttendanceService } from './modules/attendance/attendance.service';
import { SequelizeCheckInRepository } from './modules/attendance/check-in.repository';
import { MemberController, memberRoutes } from './modules/members/member.http';
import { SequelizeMemberRepository } from './modules/members/member.repository';
import { MemberService } from './modules/members/member.service';
import { LogMailer } from './modules/notifications/mailer';
import { PaymentController, paymentRoutes, webhookRoutes } from './modules/payments/payment.http';
import { ManualGateway, PaymentGatewayRegistry, StripeGateway } from './modules/payments/payment-gateway';
import { SequelizePaymentRepository } from './modules/payments/payment.repository';
import { PaymentService } from './modules/payments/payment.service';
import { EnrollmentService } from './modules/enrollments/enrollment.service';
import { PlanController, planRoutes } from './modules/plans/plan.http';
import { SequelizePlanRepository } from './modules/plans/plan.repository';
import { PlanService } from './modules/plans/plan.service';
import { ReminderController, jobRoutes, reminderRoutes } from './modules/reminders/reminder.http';
import { SequelizeReminderRepository } from './modules/reminders/reminder.repository';
import { ReminderService } from './modules/reminders/reminder.service';
import { ReportController, reportRoutes } from './modules/reports/report.http';
import { ReportService } from './modules/reports/report.service';
import { SequelizeSubscriptionEventRepository } from './modules/subscriptions/subscription-event.repository';
import { SubscriptionController, subscriptionRoutes } from './modules/subscriptions/subscription.http';
import { SequelizeSubscriptionRepository } from './modules/subscriptions/subscription.repository';
import { SubscriptionService } from './modules/subscriptions/subscription.service';
import { UserController, userRoutes } from './modules/users/user.http';
import { SequelizeUserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';

const clock = (): Date => new Date();
const tx = new SequelizeTransactionRunner();
const userRepository = new SequelizeUserRepository();
const memberRepository = new SequelizeMemberRepository();
const planRepository = new SequelizePlanRepository();
const subscriptionRepository = new SequelizeSubscriptionRepository();
const eventRepository = new SequelizeSubscriptionEventRepository();
const paymentRepository = new SequelizePaymentRepository();
const checkInRepository = new SequelizeCheckInRepository();
const reminderRepository = new SequelizeReminderRepository();
const tokenRepository = new SequelizeTokenRepository();
const mailer = new LogMailer();
const gateways = new PaymentGatewayRegistry([
  new ManualGateway(env.webhookSecret),
  new StripeGateway(env.stripeSecretKey, env.stripeWebhookSecret),
]);

const subscriptions = new SubscriptionService(
  subscriptionRepository,
  planRepository,
  memberRepository,
  eventRepository,
  paymentRepository,
  tx,
  { timeZone: env.businessTimezone, pendingTtlHours: env.pendingTtlHours, clock },
);

const payments = new PaymentService(
  paymentRepository,
  subscriptionRepository,
  memberRepository,
  (id, actorId, transaction) => subscriptions.activate(id, actorId, transaction),
  gateways,
  env.paymentGateway,
  tx,
  clock,
);

const reminders = new ReminderService(
  reminderRepository,
  subscriptionRepository,
  memberRepository,
  mailer,
  env.reminderDays,
  clock,
);

const memberService = new MemberService(
  memberRepository,
  userRepository,
  subscriptionRepository,
  paymentRepository,
  checkInRepository,
  tx,
);

export const container = {
  subscriptions,
  reminders,
  auth: new AuthController(new AuthService(userRepository, memberRepository, tokenRepository, mailer, tx)),
  users: new UserController(new UserService(userRepository, memberRepository, tokenRepository, tx)),
  members: new MemberController(memberService),
  plans: new PlanController(new PlanService(planRepository), new EnrollmentService(memberService, subscriptions, tx)),
  subscriptionHttp: new SubscriptionController(subscriptions),
  paymentHttp: new PaymentController(payments),
  attendance: new AttendanceController(
    new AttendanceService(checkInRepository, memberRepository, subscriptionRepository, tx, clock),
  ),
  reports: new ReportController(new ReportService(paymentRepository, eventRepository), clock),
  reminderHttp: new ReminderController(reminders, subscriptions),
  userRepository,
};

export function mountApi(router: import('express').Router): void {
  router.use('/auth', authRoutes(container.auth, userRepository));
  router.use('/users', userRoutes(container.users, userRepository));
  router.use('/members', memberRoutes(container.members, userRepository));
  router.use('/plans', planRoutes(container.plans, userRepository));
  router.use('/subscriptions', subscriptionRoutes(container.subscriptionHttp, userRepository));
  router.use('/payments', paymentRoutes(container.paymentHttp, userRepository));
  router.use('/webhooks', webhookRoutes(container.paymentHttp));
  router.use('/attendance', attendanceRoutes(container.attendance, userRepository));
  router.use('/reports', reportRoutes(container.reports, userRepository));
  router.use('/reminders', reminderRoutes(container.reminderHttp, userRepository));
  router.use('/jobs', jobRoutes(container.reminderHttp, userRepository));
}

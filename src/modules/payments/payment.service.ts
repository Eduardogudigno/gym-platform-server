import { newId } from '../../common/crypto';
import { assertSelfOrStaff } from '../../common/access';
import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money';
import type { Transaction, TransactionRunner } from '../../common/transaction';
import type { AuthContext } from '../../common/types/auth';
import type { PaymentMethod, PaymentStatus } from '../../common/types/domain';
import type { MemberRepository } from '../members/member.ports';
import type { PaymentListQuery, PaymentRecord, PaymentRepository, SubscriptionRepository } from '../subscriptions/billing.ports';
import type { PaymentGatewayRegistry, WebhookEvent } from './payment-gateway';

export interface CreatePaymentInput {
  subscriptionId: string;
  amount: string | number;
  currency?: string;
  method: PaymentMethod;
  status?: PaymentStatus;
  reference?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface CreateIntentInput {
  subscriptionId: string;
  amount: string | number;
  currency?: string;
}

export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members: MemberRepository,
    private readonly activate: (id: string, actorId: string, tx: Transaction) => Promise<unknown>,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly defaultProvider: string,
    private readonly tx: TransactionRunner,
    private readonly clock: () => Date,
  ) {}

  list(query: PaymentListQuery): Promise<{ rows: PaymentRecord[]; total: number }> {
    return this.payments.list(query);
  }

  async get(id: string, actor: AuthContext): Promise<PaymentRecord> {
    const payment = await this.require(id);
    await this.assertCanRead(payment.memberId, actor);
    return payment;
  }

  async create(input: CreatePaymentInput, actorId: string): Promise<PaymentRecord> {
    return this.tx.run((tx) => this.createInTx(input, actorId, tx));
  }

  async refund(id: string): Promise<PaymentRecord> {
    return this.tx.run(async (tx) => {
      const payment = await this.payments.findById(id, tx, true);
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      if (payment.status !== 'completed') {
        throw new AppError(409, 'INVALID_STATE', 'Only a completed payment can be refunded');
      }
      return this.payments.update(id, { status: 'refunded', refundedAt: this.clock() }, tx);
    });
  }

  async createIntent(input: CreateIntentInput, actorId: string) {
    const subscription = await this.subscriptions.findById(input.subscriptionId);
    if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    const gateway = this.gateways.get(this.defaultProvider);
    const paymentId = newId();
    const amount = toMoney(input.amount);
    const currency = (input.currency ?? subscription.currency).toUpperCase();
    const intent = await gateway.createIntent({
      paymentId,
      amount,
      currency,
      subscriptionId: subscription.id,
    });
    const payment = await this.payments.create({
      id: paymentId,
      subscriptionId: subscription.id,
      memberId: subscription.memberId,
      amount,
      currency,
      method: 'gateway',
      status: 'pending',
      provider: intent.provider,
      providerReference: intent.providerReference,
      recordedBy: actorId,
    });
    return { payment, clientSecret: intent.clientSecret };
  }

  async handleWebhook(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<PaymentRecord> {
    const event = await this.gateways.get(provider).parseWebhook(headers, rawBody);
    return this.applyWebhook(event);
  }

  private async createInTx(input: CreatePaymentInput, actorId: string, tx: Transaction): Promise<PaymentRecord> {
    if (input.idempotencyKey) {
      const existing = await this.payments.findByIdempotencyKey(input.idempotencyKey, tx);
      if (existing) return existing;
    }
    const subscription = await this.subscriptions.findById(input.subscriptionId, tx, true);
    if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
    const status = input.status ?? 'completed';
    const now = this.clock();
    const payment = await this.payments.create(
      {
        subscriptionId: subscription.id,
        memberId: subscription.memberId,
        amount: toMoney(input.amount),
        currency: (input.currency ?? subscription.currency).toUpperCase(),
        method: input.method,
        status,
        providerReference: input.reference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        paidAt: status === 'completed' ? now : null,
        notes: input.notes ?? null,
        recordedBy: actorId,
      },
      tx,
    );
    if (status === 'completed' && subscription.status === 'pending') {
      await this.activate(subscription.id, actorId, tx);
    }
    return payment;
  }

  private async applyWebhook(event: WebhookEvent): Promise<PaymentRecord> {
    return this.tx.run(async (tx) => {
      const payment = await this.payments.findById(event.paymentId, tx, true);
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      if (payment.status === 'refunded' || payment.status === event.status) return payment;
      const now = this.clock();
      const updated = await this.payments.update(
        payment.id,
        {
          status: event.status,
          paidAt: event.status === 'completed' ? now : payment.paidAt,
          providerReference: event.providerReference ?? payment.providerReference,
        },
        tx,
      );
      if (event.status === 'completed') {
        const subscription = await this.subscriptions.findById(payment.subscriptionId, tx, true);
        if (subscription?.status === 'pending') {
          await this.activate(subscription.id, payment.recordedBy ?? subscription.createdBy ?? payment.memberId, tx);
        }
      }
      return updated;
    });
  }

  private async assertCanRead(memberId: string, actor: AuthContext): Promise<void> {
    const member = await this.members.findById(memberId);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    assertSelfOrStaff(actor, member.userId);
  }

  private async require(id: string): Promise<PaymentRecord> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    return payment;
  }
}

import { AppError } from '../../src/common/errors/app-error';
import type { Transaction, TransactionRunner } from '../../src/common/transaction';
import type { MemberRepository } from '../../src/modules/members/member.ports';
import { PaymentService } from '../../src/modules/payments/payment.service';
import { PaymentGatewayRegistry, ManualGateway } from '../../src/modules/payments/payment-gateway';
import type { PaymentRecord, PaymentRepository, SubscriptionRecord, SubscriptionRepository } from '../../src/modules/subscriptions/billing.ports';

const tx: TransactionRunner = {
  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return work({} as Transaction);
  },
};

function subscription(status: SubscriptionRecord['status']): SubscriptionRecord {
  return {
    id: 'sub-1',
    memberId: 'member-1',
    planId: 'monthly',
    scheduledPlanId: null,
    renewedFromId: null,
    status,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-02-01T00:00:00.000Z'),
    nextRenewalAt: null,
    autoRenew: false,
    priceAmount: '39.99',
    currency: 'USD',
    pausedAt: null,
    frozenEndAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdBy: 'staff-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('payment activation', () => {
  it('activates a pending subscription when a completed payment is recorded', async () => {
    const activated: string[] = [];
    const payments: PaymentRecord[] = [];
    const paymentRepo: PaymentRepository = {
      findById: async () => null,
      findByIdempotencyKey: async () => null,
      list: async () => ({ rows: payments, total: payments.length }),
      create: async (input) => {
        const row = {
          id: 'pay-1',
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
          refundedAt: null,
          notes: input.notes ?? null,
          recordedBy: input.recordedBy ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } satisfies PaymentRecord;
        payments.push(row);
        return row;
      },
      update: async () => {
        throw new Error('not used');
      },
      revenue: async () => [],
    };
    const current = subscription('pending');
    const subscriptionRepo = {
      findById: async () => current,
    } as unknown as SubscriptionRepository;
    const service = new PaymentService(
      paymentRepo,
      subscriptionRepo,
      {} as MemberRepository,
      async (id) => {
        activated.push(id);
      },
      new PaymentGatewayRegistry([new ManualGateway('secret')]),
      'manual',
      tx,
      () => new Date('2026-01-15T00:00:00.000Z'),
    );

    await service.create({ subscriptionId: 'sub-1', amount: '39.99', method: 'cash' }, 'staff-1');
    expect(activated).toEqual(['sub-1']);
  });

  it('does not activate when the payment stays pending', async () => {
    const activated: string[] = [];
    const paymentRepo = {
      findByIdempotencyKey: async () => null,
      create: async (input: { status: string; amount: string; currency: string; subscriptionId: string; memberId: string; method: 'cash' }) =>
        ({ id: 'pay-2', ...input }) as PaymentRecord,
    } as unknown as PaymentRepository;
    const service = new PaymentService(
      paymentRepo,
      { findById: async () => subscription('pending') } as unknown as SubscriptionRepository,
      {} as MemberRepository,
      async (id) => {
        activated.push(id);
      },
      new PaymentGatewayRegistry([new ManualGateway('secret')]),
      'manual',
      tx,
      () => new Date('2026-01-15T00:00:00.000Z'),
    );
    await service.create(
      { subscriptionId: 'sub-1', amount: '10.00', method: 'cash', status: 'pending' },
      'staff-1',
    );
    expect(activated).toEqual([]);
  });

  it('rejects refunds of payments that are not completed', async () => {
    const paymentRepo = {
      findById: async () =>
        ({
          id: 'pay-3',
          status: 'pending',
        }) as PaymentRecord,
    } as unknown as PaymentRepository;
    const service = new PaymentService(
      paymentRepo,
      {} as SubscriptionRepository,
      {} as MemberRepository,
      async () => undefined,
      new PaymentGatewayRegistry([new ManualGateway('secret')]),
      'manual',
      tx,
      () => new Date(),
    );
    await expect(service.refund('pay-3')).rejects.toBeInstanceOf(AppError);
  });
});

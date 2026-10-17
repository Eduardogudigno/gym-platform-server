import { AppError } from '../../src/common/errors/app-error';
import type { Transaction, TransactionRunner } from '../../src/common/transaction';
import { EnrollmentService } from '../../src/modules/enrollments/enrollment.service';
import type { MemberRecord } from '../../src/modules/members/member.ports';
import type { MemberService } from '../../src/modules/members/member.service';
import type { SubscriptionRecord } from '../../src/modules/subscriptions/billing.ports';
import type { SubscriptionService } from '../../src/modules/subscriptions/subscription.service';

const transaction = { id: 'shared' } as unknown as Transaction;

const runner: TransactionRunner = {
  async run(work) {
    return work(transaction);
  },
};

function member(): MemberRecord {
  return {
    id: 'member-1',
    userId: 'user-1',
    email: 'nueva@gym.local',
    firstName: 'Nueva',
    lastName: 'Socia',
    phone: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    city: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    status: 'active',
    notes: null,
    createdAt: new Date('2026-10-17T00:00:00.000Z'),
    updatedAt: new Date('2026-10-17T00:00:00.000Z'),
  };
}

describe('EnrollmentService', () => {
  it('creates the person and the subscription on the same transaction', async () => {
    const createdMember = member();
    const createdSubscription = { id: 'sub-1', memberId: createdMember.id, status: 'active' } as SubscriptionRecord;
    const members = {
      create: jest.fn(async () => createdMember),
    };
    const subscriptions = {
      create: jest.fn(async () => createdSubscription),
    };
    const service = new EnrollmentService(
      members as unknown as MemberService,
      subscriptions as unknown as SubscriptionService,
      runner,
    );

    const result = await service.enroll(
      'plan-1',
      {
        email: 'nueva@gym.local',
        password: 'ChangeMe123!',
        firstName: 'Nueva',
        lastName: 'Socia',
        autoRenew: true,
        payment: { method: 'cash', amount: '39.99' },
      },
      'staff-1',
    );

    expect(result).toEqual({ member: createdMember, subscription: createdSubscription });
    expect(members.create).toHaveBeenCalledWith(
      {
        email: 'nueva@gym.local',
        password: 'ChangeMe123!',
        firstName: 'Nueva',
        lastName: 'Socia',
      },
      transaction,
    );
    expect(subscriptions.create).toHaveBeenCalledWith(
      {
        memberId: 'member-1',
        planId: 'plan-1',
        startDate: undefined,
        autoRenew: true,
        payment: { method: 'cash', amount: '39.99' },
      },
      'staff-1',
      transaction,
    );
  });

  it('propagates subscription failures so the person is not kept', async () => {
    const members = { create: jest.fn(async () => member()) };
    const subscriptions = {
      create: jest.fn(async () => {
        throw new AppError(409, 'PLAN_UNAVAILABLE', 'Plan is not active');
      }),
    };
    const service = new EnrollmentService(
      members as unknown as MemberService,
      subscriptions as unknown as SubscriptionService,
      runner,
    );

    await expect(
      service.enroll(
        'plan-1',
        { email: 'nueva@gym.local', password: 'ChangeMe123!', firstName: 'Nueva', lastName: 'Socia' },
        'staff-1',
      ),
    ).rejects.toMatchObject({ code: 'PLAN_UNAVAILABLE' });
    expect(members.create).toHaveBeenCalledTimes(1);
  });
});

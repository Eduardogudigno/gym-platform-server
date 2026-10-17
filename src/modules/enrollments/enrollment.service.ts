import type { TransactionRunner } from '../../common/transaction';
import type { CreateMemberInput, MemberService } from '../members/member.service';
import type { MemberRecord } from '../members/member.ports';
import type { SubscriptionPaymentInput, SubscriptionService } from '../subscriptions/subscription.service';
import type { SubscriptionRecord } from '../subscriptions/billing.ports';

export interface EnrollOnPlanInput extends CreateMemberInput {
  startDate?: Date | null;
  autoRenew?: boolean;
  payment?: SubscriptionPaymentInput;
}

export interface EnrollmentResult {
  member: MemberRecord;
  subscription: SubscriptionRecord;
}

export class EnrollmentService {
  constructor(
    private readonly members: MemberService,
    private readonly subscriptions: SubscriptionService,
    private readonly tx: TransactionRunner,
  ) {}

  enroll(planId: string, input: EnrollOnPlanInput, actorId: string): Promise<EnrollmentResult> {
    const { startDate, autoRenew, payment, ...member } = input;
    return this.tx.run(async (transaction) => {
      const created = await this.members.create(member, transaction);
      const subscription = await this.subscriptions.create(
        {
          memberId: created.id,
          planId,
          startDate,
          autoRenew,
          payment,
        },
        actorId,
        transaction,
      );
      return { member: created, subscription };
    });
  }
}

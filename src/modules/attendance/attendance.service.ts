import { assertSelfOrStaff } from '../../common/access';
import { AppError } from '../../common/errors/app-error';
import type { TransactionRunner } from '../../common/transaction';
import type { AuthContext } from '../../common/types/auth';
import type { MemberRepository } from '../members/member.ports';
import type { SubscriptionRepository } from '../subscriptions/billing.ports';
import { evaluateCheckIn } from './check-in.policy';
import type { CheckInListQuery, CheckInRecord, CheckInRepository } from './check-in.repository';

export class AttendanceService {
  constructor(
    private readonly checkIns: CheckInRepository,
    private readonly members: MemberRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly tx: TransactionRunner,
    private readonly clock: () => Date,
  ) {}

  list(query: CheckInListQuery): Promise<{ rows: CheckInRecord[]; total: number }> {
    return this.checkIns.list(query);
  }

  async get(id: string, actor: AuthContext): Promise<CheckInRecord> {
    const checkIn = await this.checkIns.findById(id);
    if (!checkIn) throw new AppError(404, 'CHECK_IN_NOT_FOUND', 'Check-in not found');
    const member = await this.members.findById(checkIn.memberId);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    assertSelfOrStaff(actor, member.userId);
    return checkIn;
  }

  async checkIn(input: { memberId?: string; notes?: string }, actor: AuthContext): Promise<CheckInRecord> {
    const member = await this.resolveMember(input.memberId, actor);
    const now = this.clock();
    const subscription = await this.subscriptions.findAccessible(member.id, now);
    const decision = evaluateCheckIn({
      memberStatus: member.status,
      subscription,
      now,
    });
    if (!decision.allowed) {
      throw new AppError(422, 'CHECK_IN_DENIED', 'Check-in was denied', { reason: decision.reason });
    }
    return this.tx.run((tx) =>
      this.checkIns.create(
        {
          memberId: member.id,
          subscriptionId: subscription!.id,
          checkedInAt: now,
          source: actor.role === 'member' ? 'self_service' : 'front_desk',
          notes: input.notes ?? null,
          recordedBy: actor.id,
        },
        tx,
      ),
    );
  }

  private async resolveMember(memberId: string | undefined, actor: AuthContext) {
    if (actor.role === 'member') {
      const own = await this.members.findByUserId(actor.id);
      if (!own) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member profile not found');
      if (memberId && memberId !== own.id) throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      return own;
    }
    if (!memberId) throw new AppError(400, 'VALIDATION_ERROR', 'memberId is required');
    const member = await this.members.findById(memberId);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    return member;
  }
}

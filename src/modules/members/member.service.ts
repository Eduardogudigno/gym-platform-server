import bcrypt from 'bcrypt';
import { env } from '../../config/env';
import { assertSelfOrStaff } from '../../common/access';
import { AppError } from '../../common/errors/app-error';
import type { Transaction, TransactionRunner } from '../../common/transaction';
import type { AuthContext } from '../../common/types/auth';
import type { MemberStatus } from '../../common/types/domain';
import type { CheckInRepository } from '../attendance/check-in.repository';
import type { PaymentRepository, SubscriptionRepository } from '../subscriptions/billing.ports';
import type { UserRepository } from '../users/user.ports';
import type { MemberListQuery, MemberProfile, MemberRecord, MemberRepository } from './member.ports';

export interface CreateMemberInput extends MemberProfile {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface UpdateMemberInput extends MemberProfile {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export class MemberService {
  constructor(
    private readonly members: MemberRepository,
    private readonly users: UserRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly payments: PaymentRepository,
    private readonly checkIns: CheckInRepository,
    private readonly tx: TransactionRunner,
  ) {}

  list(query: MemberListQuery): Promise<{ rows: MemberRecord[]; total: number }> {
    return this.members.list(query);
  }

  async create(input: CreateMemberInput, tx?: Transaction): Promise<MemberRecord> {
    const existing = await this.users.findByEmail(input.email, tx);
    if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'Email is already in use');
    const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    const work = async (transaction: Transaction) => {
      const user = await this.users.create(
        {
          email: input.email,
          passwordHash,
          role: 'member',
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
        },
        transaction,
      );
      return this.members.create({ userId: user.id, ...input, status: input.status ?? 'active' }, transaction);
    };
    if (tx) return work(tx);
    return this.tx.run(work);
  }

  async get(id: string, actor: AuthContext): Promise<MemberRecord> {
    const member = await this.require(id);
    assertSelfOrStaff(actor, member.userId);
    return member;
  }

  async update(id: string, input: UpdateMemberInput, actor: AuthContext): Promise<MemberRecord> {
    const member = await this.require(id);
    assertSelfOrStaff(actor, member.userId);
    if (actor.role === 'member' && input.status && input.status !== member.status) {
      throw new AppError(403, 'FORBIDDEN', 'Members cannot change their own status');
    }
    return this.tx.run(async (tx) => {
      await this.users.update(
        member.userId,
        { firstName: input.firstName, lastName: input.lastName, phone: input.phone },
        tx,
      );
      return this.members.update(id, input, tx);
    });
  }

  async changeStatus(id: string, status: MemberStatus): Promise<MemberRecord> {
    await this.require(id);
    return this.members.update(id, { status });
  }

  async remove(id: string): Promise<void> {
    const member = await this.require(id);
    await this.tx.run(async (tx) => {
      await this.users.update(member.userId, { status: 'inactive' }, tx);
      await this.members.softDelete(id, tx);
    });
  }

  async history(id: string, actor: AuthContext) {
    const member = await this.require(id);
    assertSelfOrStaff(actor, member.userId);
    const [subscriptions, payments, checkIns] = await Promise.all([
      this.subscriptions.list({ memberId: id, page: 1, pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' }),
      this.payments.list({ memberId: id, page: 1, pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' }),
      this.checkIns.list({ memberId: id, page: 1, pageSize: 50, sortBy: 'checkedInAt', sortDir: 'desc' }),
    ]);
    return {
      member,
      subscriptions: subscriptions.rows,
      payments: payments.rows,
      checkIns: checkIns.rows,
    };
  }

  private async require(id: string): Promise<MemberRecord> {
    const member = await this.members.findById(id);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    return member;
  }
}

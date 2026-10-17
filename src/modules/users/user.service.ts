import bcrypt from 'bcrypt';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import type { TransactionRunner } from '../../common/transaction';
import type { AuthContext, Role } from '../../common/types/auth';
import type { UserStatus } from '../../common/types/domain';
import type { MemberProfile, MemberRecord, MemberRepository } from '../members/member.ports';
import type { TokenRepository } from '../auth/token.repository';
import type { UserListQuery, UserRecord, UserRepository } from './user.ports';

export interface CreateUserInput extends MemberProfile {
  email: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  password?: string;
  currentPassword?: string;
}

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly members: MemberRepository,
    private readonly tokens: TokenRepository,
    private readonly tx: TransactionRunner,
  ) {}

  list(query: UserListQuery): Promise<{ rows: UserRecord[]; total: number }> {
    return this.users.list(query);
  }

  async get(id: string, actor: AuthContext): Promise<UserRecord> {
    const user = await this.require(id);
    if (actor.role !== 'admin' && actor.id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    return user;
  }

  async create(input: CreateUserInput): Promise<{ user: UserRecord; member: MemberRecord | null }> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'Email is already in use');
    const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    return this.tx.run(async (tx) => {
      const user = await this.users.create(
        {
          email: input.email,
          passwordHash,
          role: input.role,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
        },
        tx,
      );
      if (user.role !== 'member') return { user, member: null };
      const member = await this.members.create(
        {
          userId: user.id,
          status: 'active',
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          emergencyContactRelationship: input.emergencyContactRelationship ?? null,
          notes: input.notes ?? null,
        },
        tx,
      );
      return { user, member };
    });
  }

  async update(id: string, input: UpdateUserInput, actor: AuthContext): Promise<UserRecord> {
    const user = await this.require(id);
    if (actor.role !== 'admin' && actor.id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    let passwordHash: string | undefined;
    if (input.password) {
      if (actor.role !== 'admin') {
        const authUser = await this.users.findAuthByEmail(user.email);
        const current = input.currentPassword ?? '';
        const matches = authUser ? await bcrypt.compare(current, authUser.passwordHash) : false;
        if (!matches) throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is invalid');
      }
      passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    }
    return this.users.update(id, {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      passwordHash,
    });
  }

  async changeRole(id: string, role: Role): Promise<UserRecord> {
    return this.tx.run(async (tx) => {
      const user = await this.require(id, tx);
      if (user.role === 'admin' && role !== 'admin') await this.assertKeepsAdmin(tx);
      const updated = await this.users.update(id, { role }, tx);
      if (role === 'member') {
        const member = await this.members.findByUserId(id, tx);
        if (!member) await this.members.create({ userId: id, status: 'active' }, tx);
      }
      return updated;
    });
  }

  async changeStatus(id: string, status: UserStatus): Promise<UserRecord> {
    return this.tx.run(async (tx) => {
      const user = await this.require(id, tx);
      if (user.role === 'admin' && status !== 'active') await this.assertKeepsAdmin(tx);
      if (status !== 'active') await this.tokens.revokeAllForUser(id, new Date(), tx);
      return this.users.update(id, { status }, tx);
    });
  }

  async remove(id: string, actor: AuthContext): Promise<void> {
    if (actor.id === id) throw new AppError(409, 'CANNOT_DELETE_SELF', 'You cannot delete your own account');
    await this.tx.run(async (tx) => {
      const user = await this.require(id, tx);
      if (user.role === 'admin') await this.assertKeepsAdmin(tx);
      await this.tokens.revokeAllForUser(id, new Date(), tx);
      const member = await this.members.findByUserId(id, tx);
      if (member) await this.members.softDelete(member.id, tx);
      await this.users.anonymizeAndDelete(id, tx);
    });
  }

  private async assertKeepsAdmin(tx: import('../../common/transaction').Transaction): Promise<void> {
    const admins = await this.users.countActiveAdmins(tx);
    if (admins <= 1) throw new AppError(409, 'LAST_ADMIN', 'The last active admin cannot be removed');
  }

  private async require(id: string, tx?: import('../../common/transaction').Transaction): Promise<UserRecord> {
    const user = await this.users.findById(id, tx);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    return user;
  }
}

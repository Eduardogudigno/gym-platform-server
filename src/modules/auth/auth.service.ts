import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import ms from 'ms';
import { randomBytes } from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import { newId, sha256 } from '../../common/crypto';
import type { TransactionRunner } from '../../common/transaction';
import type { MemberProfile, MemberRecord, MemberRepository } from '../members/member.ports';
import type { Mailer } from '../notifications/mailer';
import type { UserRecord, UserRepository } from '../users/user.ports';
import type { TokenRepository } from './token.repository';

export interface ClientMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: UserRecord;
  member: MemberRecord | null;
}

export interface RegisterInput extends MemberProfile {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

const RESET_TTL_MS = 60 * 60 * 1000;

function durationMs(value: string): number {
  const parsed = ms(value as ms.StringValue);
  if (!parsed) throw new Error(`Invalid duration ${value}`);
  return parsed;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly members: MemberRepository,
    private readonly tokens: TokenRepository,
    private readonly mailer: Mailer,
    private readonly tx: TransactionRunner,
  ) {}

  async register(input: RegisterInput, meta: ClientMeta): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'Email is already in use');
    const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    return this.tx.run(async (tx) => {
      const user = await this.users.create(
        {
          email: input.email,
          passwordHash,
          role: 'member',
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
        },
        tx,
      );
      const member = await this.members.create({ userId: user.id, ...profileOf(input), status: 'active' }, tx);
      return this.issue(user, member, meta, tx);
    });
  }

  async login(email: string, password: string, meta: ClientMeta): Promise<AuthResult> {
    const authUser = await this.users.findAuthByEmail(email);
    if (!authUser) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    const matches = await bcrypt.compare(password, authUser.passwordHash);
    if (!matches) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    if (authUser.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is inactive');
    await this.users.update(authUser.id, { lastLoginAt: new Date() });
    const member = await this.members.findByUserId(authUser.id);
    const { passwordHash: _password, ...user } = authUser;
    return this.issue(user, member, meta);
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<AuthResult> {
    const payload = this.readRefresh(refreshToken);
    const session = await this.tokens.findRefresh(payload.jti);
    if (!session || session.userId !== payload.sub || session.tokenHash !== sha256(refreshToken)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }
    if (session.revokedAt) {
      await this.tokens.revokeAllForUser(session.userId, new Date());
      throw new AppError(401, 'TOKEN_REUSED', 'Refresh token was already used');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Refresh token expired');
    }
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'active') throw new AppError(401, 'UNAUTHORIZED', 'Account is not active');
    const member = await this.members.findByUserId(user.id);
    return this.tx.run(async (tx) => {
      const issued = await this.issue(user, member, meta, tx);
      await this.tokens.revokeRefresh(session.id, null, new Date(), tx);
      return issued;
    });
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const payload = this.readRefresh(refreshToken);
    if (payload.sub !== userId) throw new AppError(403, 'FORBIDDEN', 'Refresh token does not belong to this account');
    const session = await this.tokens.findRefresh(payload.jti);
    if (!session || session.tokenHash !== sha256(refreshToken)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }
    if (!session.revokedAt) await this.tokens.revokeRefresh(session.id, null, new Date());
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'active') return;
    const raw = randomBytes(32).toString('hex');
    const now = new Date();
    await this.tx.run(async (tx) => {
      await this.tokens.invalidateResets(user.id, now, tx);
      await this.tokens.insertReset(
        { id: newId(), userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(now.getTime() + RESET_TTL_MS) },
        tx,
      );
    });
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your gym password',
      text: `Use this reset token within 60 minutes: ${raw}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await this.tokens.findReset(sha256(token));
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Reset token is invalid or expired');
    }
    const passwordHash = await bcrypt.hash(newPassword, env.bcryptRounds);
    const now = new Date();
    await this.tx.run(async (tx) => {
      await this.users.update(row.userId, { passwordHash }, tx);
      await this.tokens.markResetUsed(row.id, now, tx);
      await this.tokens.revokeAllForUser(row.userId, now, tx);
    });
  }

  async me(userId: string): Promise<{ user: UserRecord; member: MemberRecord | null }> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Account is not active');
    const member = await this.members.findByUserId(userId);
    return { user, member };
  }

  private async issue(
    user: UserRecord,
    member: MemberRecord | null,
    meta: ClientMeta,
    tx?: import('../../common/transaction').Transaction,
  ): Promise<AuthResult> {
    const refreshId = newId();
    const expiresIn = env.jwtAccessTtl;
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, typ: 'access' },
      env.jwtAccessSecret,
      { expiresIn: expiresIn as SignOptions['expiresIn'] },
    );
    const refreshToken = jwt.sign({ sub: user.id, role: user.role, typ: 'refresh' }, env.jwtRefreshSecret, {
      expiresIn: env.jwtRefreshTtl as SignOptions['expiresIn'],
      jwtid: refreshId,
    });
    await this.tokens.insertRefresh(
      {
        id: refreshId,
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + durationMs(env.jwtRefreshTtl)),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
      tx,
    );
    return { accessToken, refreshToken, expiresIn, user, member };
  }

  private readRefresh(token: string): { sub: string; jti: string; typ: string } {
    try {
      const payload = jwt.verify(token, env.jwtRefreshSecret) as jwt.JwtPayload;
      if (payload.typ !== 'refresh' || !payload.sub || !payload.jti) {
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
      }
      return { sub: payload.sub, jti: payload.jti, typ: payload.typ };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Refresh token expired');
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }
  }
}

function profileOf(input: RegisterInput): MemberProfile {
  return {
    dateOfBirth: input.dateOfBirth ?? null,
    gender: input.gender ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    emergencyContactRelationship: input.emergencyContactRelationship ?? null,
    notes: input.notes ?? null,
  };
}

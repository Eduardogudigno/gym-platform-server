import { Op, type Transaction } from 'sequelize';
import { PasswordResetToken, RefreshToken } from '../../database/models';

export interface RefreshSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ResetTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface TokenRepository {
  insertRefresh(
    input: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent: string | null;
      ipAddress: string | null;
    },
    tx?: Transaction,
  ): Promise<void>;
  findRefresh(id: string): Promise<RefreshSession | null>;
  revokeRefresh(id: string, replacedById: string | null, at: Date, tx?: Transaction): Promise<void>;
  revokeAllForUser(userId: string, at: Date, tx?: Transaction): Promise<void>;
  insertReset(input: { id: string; userId: string; tokenHash: string; expiresAt: Date }, tx?: Transaction): Promise<void>;
  invalidateResets(userId: string, at: Date, tx?: Transaction): Promise<void>;
  findReset(tokenHash: string): Promise<ResetTokenRecord | null>;
  markResetUsed(id: string, at: Date, tx?: Transaction): Promise<void>;
}

export class SequelizeTokenRepository implements TokenRepository {
  async insertRefresh(
    input: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent: string | null;
      ipAddress: string | null;
    },
    tx?: Transaction,
  ): Promise<void> {
    await RefreshToken.create(input, { transaction: tx });
  }

  async findRefresh(id: string): Promise<RefreshSession | null> {
    const row = await RefreshToken.findByPk(id);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async revokeRefresh(id: string, replacedById: string | null, at: Date, tx?: Transaction): Promise<void> {
    await RefreshToken.update({ revokedAt: at, replacedById }, { where: { id }, transaction: tx });
  }

  async revokeAllForUser(userId: string, at: Date, tx?: Transaction): Promise<void> {
    await RefreshToken.update(
      { revokedAt: at },
      { where: { userId, revokedAt: { [Op.is]: null } }, transaction: tx },
    );
  }

  async insertReset(
    input: { id: string; userId: string; tokenHash: string; expiresAt: Date },
    tx?: Transaction,
  ): Promise<void> {
    await PasswordResetToken.create(input, { transaction: tx });
  }

  async invalidateResets(userId: string, at: Date, tx?: Transaction): Promise<void> {
    await PasswordResetToken.update(
      { usedAt: at },
      { where: { userId, usedAt: { [Op.is]: null } }, transaction: tx },
    );
  }

  async findReset(tokenHash: string): Promise<ResetTokenRecord | null> {
    const row = await PasswordResetToken.findOne({ where: { tokenHash } });
    if (!row) return null;
    return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, usedAt: row.usedAt };
  }

  async markResetUsed(id: string, at: Date, tx?: Transaction): Promise<void> {
    await PasswordResetToken.update({ usedAt: at }, { where: { id }, transaction: tx });
  }
}

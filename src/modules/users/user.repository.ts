import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { AppError } from '../../common/errors/app-error';
import { likeContains } from '../../common/pagination/pagination';
import { definedPatch } from '../../database/values';
import { User } from '../../database/models';
import type { AuthUserRecord, UserListQuery, UserPatch, UserRecord, UserRepository, UserWrite } from './user.ports';

function toUser(row: User): UserRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SequelizeUserRepository implements UserRepository {
  async findById(id: string, tx?: Transaction): Promise<UserRecord | null> {
    const row = await User.findByPk(id, { transaction: tx });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string, tx?: Transaction): Promise<UserRecord | null> {
    const row = await User.findOne({ where: { email }, transaction: tx });
    return row ? toUser(row) : null;
  }

  async findAuthByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = await User.findOne({ where: { email } });
    if (!row) return null;
    return { ...toUser(row), passwordHash: row.passwordHash };
  }

  async list(query: UserListQuery): Promise<{ rows: UserRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      const like = likeContains(query.search);
      Object.assign(where, {
        [Op.or]: [{ email: { [Op.like]: like } }, { firstName: { [Op.like]: like } }, { lastName: { [Op.like]: like } }],
      });
    }
    const result = await User.findAndCountAll({
      where,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: [[query.sortBy, query.sortDir]],
    });
    return { rows: result.rows.map(toUser), total: result.count };
  }

  async create(input: UserWrite, tx?: Transaction): Promise<UserRecord> {
    const row = await User.create(
      {
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        status: input.status ?? 'active',
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
      },
      { transaction: tx },
    );
    return toUser(row);
  }

  async update(id: string, patch: UserPatch, tx?: Transaction): Promise<UserRecord> {
    const row = await User.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    await row.update(definedPatch(patch), { transaction: tx });
    return toUser(row);
  }

  async countActiveAdmins(tx?: Transaction): Promise<number> {
    return User.count({ where: { role: 'admin', status: 'active' }, transaction: tx });
  }

  async anonymizeAndDelete(id: string, tx?: Transaction): Promise<void> {
    const row = await User.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    await row.update({ email: `deleted.${row.id}@invalid.local`, status: 'inactive' }, { transaction: tx });
    await row.destroy({ transaction: tx });
  }
}

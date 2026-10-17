import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { AppError } from '../../common/errors/app-error';
import { likeContains } from '../../common/pagination/pagination';
import { definedPatch } from '../../database/values';
import { Member, User } from '../../database/models';
import type { MemberListQuery, MemberProfile, MemberRecord, MemberRepository } from './member.ports';

function toMember(row: Member): MemberRecord {
  const user = row.user;
  if (!user) throw new AppError(500, 'INTERNAL_ERROR', 'Member is missing its user');
  return {
    id: row.id,
    userId: row.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    address: row.address,
    city: row.city,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    emergencyContactRelationship: row.emergencyContactRelationship,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SequelizeMemberRepository implements MemberRepository {
  async findById(id: string, tx?: Transaction, lock = false): Promise<MemberRecord | null> {
    const row = await Member.findByPk(id, {
      transaction: tx,
      lock: lock && tx ? tx.LOCK.UPDATE : undefined,
      include: [{ model: User, required: true }],
    });
    return row ? toMember(row) : null;
  }

  async findByUserId(userId: string, tx?: Transaction): Promise<MemberRecord | null> {
    const row = await Member.findOne({
      where: { userId },
      transaction: tx,
      include: [{ model: User, required: true }],
    });
    return row ? toMember(row) : null;
  }

  async list(query: MemberListQuery): Promise<{ rows: MemberRecord[]; total: number }> {
    const where: WhereOptions = {};
    if (query.status) where.status = query.status;
    const userWhere: WhereOptions | undefined = query.search
      ? {
          [Op.or]: [
            { email: { [Op.like]: likeContains(query.search) } },
            { firstName: { [Op.like]: likeContains(query.search) } },
            { lastName: { [Op.like]: likeContains(query.search) } },
          ],
        }
      : undefined;
    const order =
      query.sortBy === 'firstName' || query.sortBy === 'lastName' || query.sortBy === 'email'
        ? [[{ model: User, as: 'user' }, query.sortBy, query.sortDir]]
        : [[query.sortBy, query.sortDir]];
    const result = await Member.findAndCountAll({
      where,
      include: [{ model: User, required: true, where: userWhere }],
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
      order: order as never,
      distinct: true,
    });
    return { rows: result.rows.map(toMember), total: result.count };
  }

  async create(input: { userId: string } & MemberProfile, tx?: Transaction): Promise<MemberRecord> {
    await Member.create(
      {
        userId: input.userId,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        emergencyContactRelationship: input.emergencyContactRelationship ?? null,
        notes: input.notes ?? null,
        status: input.status ?? 'active',
      },
      { transaction: tx },
    );
    const created = await this.findByUserId(input.userId, tx);
    if (!created) throw new AppError(500, 'INTERNAL_ERROR', 'Member was not created');
    return created;
  }

  async update(id: string, patch: MemberProfile, tx?: Transaction): Promise<MemberRecord> {
    const row = await Member.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    await row.update(definedPatch(patch), { transaction: tx });
    const updated = await this.findById(id, tx);
    if (!updated) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    return updated;
  }

  async softDelete(id: string, tx?: Transaction): Promise<void> {
    const row = await Member.findByPk(id, { transaction: tx });
    if (!row) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    await row.destroy({ transaction: tx });
  }
}

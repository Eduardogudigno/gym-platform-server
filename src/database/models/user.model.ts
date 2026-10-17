import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  HasOne,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import type { Role } from '../../common/types/auth';
import type { UserStatus } from '../../common/types/domain';
import { Member } from './member.model';
import { RefreshToken } from './refresh-token.model';

@Table({ tableName: 'users', paranoid: true, underscored: true })
export class User extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare email: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare passwordHash: string;

  @AllowNull(false)
  @Column(DataType.ENUM('admin', 'staff', 'member'))
  declare role: Role;

  @AllowNull(false)
  @Default('active')
  @Column(DataType.ENUM('active', 'inactive'))
  declare status: UserStatus;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  declare firstName: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  declare lastName: string;

  @AllowNull(true)
  @Column(DataType.STRING(30))
  declare phone: string | null;

  @AllowNull(true)
  @Column(DataType.DATE(3))
  declare lastLoginAt: Date | null;

  @HasOne(() => Member)
  declare member?: Member;

  @HasMany(() => RefreshToken)
  declare refreshTokens?: RefreshToken[];

  declare createdAt: Date;
  declare updatedAt: Date;
  declare deletedAt: Date | null;

  toJSON(): object {
    const values = { ...this.get() } as Record<string, unknown>;
    delete values.passwordHash;
    return values;
  }
}

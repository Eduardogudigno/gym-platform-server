import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import type { MemberStatus } from '../../common/types/domain';
import { User } from './user.model';
import { Subscription } from './subscription.model';

@Table({ tableName: 'members', paranoid: true, underscored: true })
export class Member extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare userId: string;

  @Column(DataType.DATEONLY)
  declare dateOfBirth: string | null;

  @Column(DataType.STRING(32))
  declare gender: string | null;

  @Column(DataType.STRING(255))
  declare address: string | null;

  @Column(DataType.STRING(100))
  declare city: string | null;

  @Column(DataType.STRING(150))
  declare emergencyContactName: string | null;

  @Column(DataType.STRING(30))
  declare emergencyContactPhone: string | null;

  @Column(DataType.STRING(50))
  declare emergencyContactRelationship: string | null;

  @Default('active')
  @Column(DataType.ENUM('active', 'inactive', 'suspended'))
  declare status: MemberStatus;

  @Column(DataType.TEXT)
  declare notes: string | null;

  @BelongsTo(() => User)
  declare user?: User;

  @HasMany(() => Subscription)
  declare subscriptions?: Subscription[];

  declare createdAt: Date;
  declare updatedAt: Date;
  declare deletedAt: Date | null;
}

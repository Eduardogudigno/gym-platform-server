import { BelongsTo, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { CheckInSource } from '../../common/types/domain';
import { Member } from './member.model';
import { Subscription } from './subscription.model';
import { User } from './user.model';

@Table({ tableName: 'check_ins', underscored: true })
export class CheckIn extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Member)
  @Column(DataType.UUID)
  declare memberId: string;

  @ForeignKey(() => Subscription)
  @Column(DataType.UUID)
  declare subscriptionId: string;

  @Column(DataType.DATE(3))
  declare checkedInAt: Date;

  @Column(DataType.ENUM('front_desk', 'self_service'))
  declare source: CheckInSource;

  @Column(DataType.STRING(255))
  declare notes: string | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare recordedBy: string | null;

  @BelongsTo(() => Member)
  declare member?: Member;

  @BelongsTo(() => Subscription)
  declare subscription?: Subscription;

  declare createdAt: Date;
  declare updatedAt: Date;
}

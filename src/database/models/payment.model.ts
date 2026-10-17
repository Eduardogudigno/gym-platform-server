import { BelongsTo, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { PaymentMethod, PaymentStatus } from '../../common/types/domain';
import { Member } from './member.model';
import { Subscription } from './subscription.model';
import { User } from './user.model';

@Table({ tableName: 'payments', underscored: true })
export class Payment extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Subscription)
  @Column(DataType.UUID)
  declare subscriptionId: string;

  @ForeignKey(() => Member)
  @Column(DataType.UUID)
  declare memberId: string;

  @Column(DataType.DECIMAL(10, 2))
  declare amount: string;

  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column(DataType.ENUM('cash', 'card', 'transfer', 'gateway'))
  declare method: PaymentMethod;

  @Column(DataType.ENUM('pending', 'completed', 'failed', 'refunded'))
  declare status: PaymentStatus;

  @Column(DataType.STRING(32))
  declare provider: string | null;

  @Column(DataType.STRING(191))
  declare providerReference: string | null;

  @Column(DataType.STRING(191))
  declare idempotencyKey: string | null;

  @Column(DataType.DATE(3))
  declare paidAt: Date | null;

  @Column(DataType.DATE(3))
  declare refundedAt: Date | null;

  @Column(DataType.STRING(500))
  declare notes: string | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare recordedBy: string | null;

  @BelongsTo(() => Subscription)
  declare subscription?: Subscription;

  @BelongsTo(() => Member)
  declare member?: Member;

  declare createdAt: Date;
  declare updatedAt: Date;
}

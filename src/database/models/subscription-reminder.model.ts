import { BelongsTo, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { ReminderStatus, ReminderType } from '../../common/types/domain';
import { Subscription } from './subscription.model';

@Table({ tableName: 'subscription_reminders', underscored: true })
export class SubscriptionReminder extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Subscription)
  @Column(DataType.UUID)
  declare subscriptionId: string;

  @Column(DataType.ENUM('expiring_7d', 'expiring_3d', 'expiring_1d', 'expired'))
  declare type: ReminderType;

  @Column(DataType.DATE(3))
  declare periodEnd: Date;

  @Default('pending')
  @Column(DataType.ENUM('pending', 'sent', 'failed'))
  declare status: ReminderStatus;

  @Column(DataType.DATE(3))
  declare scheduledFor: Date;

  @Column(DataType.DATE(3))
  declare sentAt: Date | null;

  @BelongsTo(() => Subscription)
  declare subscription?: Subscription;

  declare createdAt: Date;
  declare updatedAt: Date;
}

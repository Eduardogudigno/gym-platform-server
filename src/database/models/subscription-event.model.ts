import { BelongsTo, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { SubscriptionEventType, SubscriptionStatus } from '../../common/types/domain';
import { Subscription } from './subscription.model';
import { User } from './user.model';

@Table({ tableName: 'subscription_events', underscored: true, updatedAt: false })
export class SubscriptionEvent extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Subscription)
  @Column(DataType.UUID)
  declare subscriptionId: string;

  @Column(
    DataType.ENUM('created', 'activated', 'renewed', 'paused', 'resumed', 'cancelled', 'plan_changed', 'expired'),
  )
  declare type: SubscriptionEventType;

  @Column(DataType.ENUM('pending', 'active', 'paused', 'expired', 'cancelled'))
  declare fromStatus: SubscriptionStatus | null;

  @Column(DataType.ENUM('pending', 'active', 'paused', 'expired', 'cancelled'))
  declare toStatus: SubscriptionStatus | null;

  @Column(DataType.UUID)
  declare fromPlanId: string | null;

  @Column(DataType.UUID)
  declare toPlanId: string | null;

  @Column(DataType.JSON)
  declare payload: Record<string, unknown> | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare actorUserId: string | null;

  @BelongsTo(() => Subscription)
  declare subscription?: Subscription;

  declare createdAt: Date;
}

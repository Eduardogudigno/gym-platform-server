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
import type { SubscriptionStatus } from '../../common/types/domain';
import { Member } from './member.model';
import { MembershipPlan } from './membership-plan.model';
import { User } from './user.model';
import { SubscriptionEvent } from './subscription-event.model';

@Table({ tableName: 'subscriptions', underscored: true })
export class Subscription extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Member)
  @Column(DataType.UUID)
  declare memberId: string;

  @ForeignKey(() => MembershipPlan)
  @Column(DataType.UUID)
  declare planId: string;

  @ForeignKey(() => MembershipPlan)
  @Column(DataType.UUID)
  declare scheduledPlanId: string | null;

  @ForeignKey(() => Subscription)
  @Column(DataType.UUID)
  declare renewedFromId: string | null;

  @Column(DataType.ENUM('pending', 'active', 'paused', 'expired', 'cancelled'))
  declare status: SubscriptionStatus;

  @Column(DataType.DATE(3))
  declare startDate: Date | null;

  @Column(DataType.DATE(3))
  declare endDate: Date | null;

  @Column(DataType.DATE(3))
  declare nextRenewalAt: Date | null;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare autoRenew: boolean;

  @Column(DataType.DECIMAL(10, 2))
  declare priceAmount: string;

  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column(DataType.DATE(3))
  declare pausedAt: Date | null;

  @Column(DataType.DATE(3))
  declare frozenEndAt: Date | null;

  @Column(DataType.DATE(3))
  declare cancelledAt: Date | null;

  @Column(DataType.STRING(255))
  declare cancellationReason: string | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare createdBy: string | null;

  @BelongsTo(() => Member)
  declare member?: Member;

  @BelongsTo(() => MembershipPlan, 'planId')
  declare plan?: MembershipPlan;

  @BelongsTo(() => MembershipPlan, 'scheduledPlanId')
  declare scheduledPlan?: MembershipPlan;

  @BelongsTo(() => Subscription, 'renewedFromId')
  declare renewedFrom?: Subscription;

  @HasMany(() => SubscriptionEvent)
  declare events?: SubscriptionEvent[];

  declare createdAt: Date;
  declare updatedAt: Date;
}

import { Column, DataType, Default, HasMany, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { BillingPeriod } from '../../common/types/domain';
import { Subscription } from './subscription.model';

@Table({ tableName: 'membership_plans', paranoid: true, underscored: true })
export class MembershipPlan extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.STRING(120))
  declare name: string;

  @Column(DataType.STRING(500))
  declare description: string | null;

  @Column(DataType.DECIMAL(10, 2))
  declare price: string;

  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column(DataType.ENUM('monthly', 'quarterly', 'yearly'))
  declare duration: BillingPeriod;

  @Column(DataType.JSON)
  declare benefits: string[];

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean;

  @HasMany(() => Subscription, 'planId')
  declare subscriptions?: Subscription[];

  declare createdAt: Date;
  declare updatedAt: Date;
  declare deletedAt: Date | null;
}

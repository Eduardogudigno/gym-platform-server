export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'pending' | 'active' | 'paused' | 'expired' | 'cancelled';
export type MemberStatus = 'active' | 'inactive' | 'suspended';
export type UserStatus = 'active' | 'inactive';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'gateway';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type SubscriptionEventType =
  | 'created'
  | 'activated'
  | 'renewed'
  | 'paused'
  | 'resumed'
  | 'cancelled'
  | 'plan_changed'
  | 'expired';
export type ReminderType = 'expiring_7d' | 'expiring_3d' | 'expiring_1d' | 'expired';
export type ReminderStatus = 'pending' | 'sent' | 'failed';
export type CheckInSource = 'front_desk' | 'self_service';
export type PlanChangeMode = 'immediate' | 'next_cycle';

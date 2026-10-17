'use strict';

const ALREADY_EXISTS = new Set([
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_FK_DUP_NAME',
  'ER_DUP_CONSTRAINT_NAME',
  'ER_CHECK_CONSTRAINT_DUP_NAME',
]);

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff', 'member') NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NULL,
    last_login_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role_status (role, status),
    KEY idx_users_deleted_at (deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    revoked_at DATETIME(3) NULL,
    replaced_by_id CHAR(36) NULL,
    user_agent VARCHAR(255) NULL,
    ip_address VARCHAR(45) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_refresh_tokens_hash (token_hash),
    KEY idx_refresh_tokens_user (user_id),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_replaced_by
    FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens (id) ON UPDATE CASCADE ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_password_reset_hash (token_hash),
    KEY idx_password_reset_user (user_id),
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS members (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    date_of_birth DATE NULL,
    gender VARCHAR(32) NULL,
    address VARCHAR(255) NULL,
    city VARCHAR(100) NULL,
    emergency_contact_name VARCHAR(150) NULL,
    emergency_contact_phone VARCHAR(30) NULL,
    emergency_contact_relationship VARCHAR(50) NULL,
    status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
    notes TEXT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_members_user (user_id),
    KEY idx_members_status (status),
    KEY idx_members_deleted_at (deleted_at),
    CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS membership_plans (
    id CHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    price DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    duration ENUM('monthly', 'quarterly', 'yearly') NOT NULL,
    benefits JSON NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_plans_active (is_active),
    KEY idx_plans_deleted_at (deleted_at),
    CONSTRAINT chk_plans_price CHECK (price >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id CHAR(36) NOT NULL,
    member_id CHAR(36) NOT NULL,
    plan_id CHAR(36) NOT NULL,
    scheduled_plan_id CHAR(36) NULL,
    renewed_from_id CHAR(36) NULL,
    status ENUM('pending', 'active', 'paused', 'expired', 'cancelled') NOT NULL,
    start_date DATETIME(3) NULL,
    end_date DATETIME(3) NULL,
    next_renewal_at DATETIME(3) NULL,
    auto_renew TINYINT(1) NOT NULL DEFAULT 0,
    price_amount DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    paused_at DATETIME(3) NULL,
    frozen_end_at DATETIME(3) NULL,
    cancelled_at DATETIME(3) NULL,
    cancellation_reason VARCHAR(255) NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    open_member_key CHAR(36) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subscriptions_open_member (open_member_key),
    KEY idx_subscriptions_member (member_id),
    KEY idx_subscriptions_status_end (status, end_date),
    KEY idx_subscriptions_plan (plan_id),
    CONSTRAINT chk_subscriptions_price CHECK (price_amount >= 0),
    CONSTRAINT fk_subscriptions_member FOREIGN KEY (member_id) REFERENCES members (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES membership_plans (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_subscriptions_scheduled_plan FOREIGN KEY (scheduled_plan_id) REFERENCES membership_plans (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_subscriptions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE subscriptions
    ADD CONSTRAINT fk_subscriptions_renewed_from
    FOREIGN KEY (renewed_from_id) REFERENCES subscriptions (id) ON UPDATE CASCADE ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS subscription_events (
    id CHAR(36) NOT NULL,
    subscription_id CHAR(36) NOT NULL,
    type ENUM('created', 'activated', 'renewed', 'paused', 'resumed', 'cancelled', 'plan_changed', 'expired') NOT NULL,
    from_status ENUM('pending', 'active', 'paused', 'expired', 'cancelled') NULL,
    to_status ENUM('pending', 'active', 'paused', 'expired', 'cancelled') NULL,
    from_plan_id CHAR(36) NULL,
    to_plan_id CHAR(36) NULL,
    payload JSON NULL,
    actor_user_id CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_events_subscription (subscription_id),
    KEY idx_events_type_created (type, created_at),
    CONSTRAINT fk_events_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_events_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS payments (
    id CHAR(36) NOT NULL,
    subscription_id CHAR(36) NOT NULL,
    member_id CHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    method ENUM('cash', 'card', 'transfer', 'gateway') NOT NULL,
    status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL,
    provider VARCHAR(32) NULL,
    provider_reference VARCHAR(191) NULL,
    idempotency_key VARCHAR(191) NULL,
    paid_at DATETIME(3) NULL,
    refunded_at DATETIME(3) NULL,
    notes VARCHAR(500) NULL,
    recorded_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payments_idempotency (idempotency_key),
    KEY idx_payments_subscription (subscription_id),
    KEY idx_payments_member (member_id),
    KEY idx_payments_status_paid (status, paid_at),
    KEY idx_payments_status_refunded (status, refunded_at),
    CONSTRAINT chk_payments_amount CHECK (amount >= 0),
    CONSTRAINT fk_payments_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS check_ins (
    id CHAR(36) NOT NULL,
    member_id CHAR(36) NOT NULL,
    subscription_id CHAR(36) NOT NULL,
    checked_in_at DATETIME(3) NOT NULL,
    source ENUM('front_desk', 'self_service') NOT NULL,
    notes VARCHAR(255) NULL,
    recorded_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_check_ins_member_time (member_id, checked_in_at),
    KEY idx_check_ins_subscription (subscription_id),
    CONSTRAINT fk_check_ins_member FOREIGN KEY (member_id) REFERENCES members (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_check_ins_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_check_ins_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS subscription_reminders (
    id CHAR(36) NOT NULL,
    subscription_id CHAR(36) NOT NULL,
    type ENUM('expiring_7d', 'expiring_3d', 'expiring_1d', 'expired') NOT NULL,
    period_end DATETIME(3) NOT NULL,
    status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    scheduled_for DATETIME(3) NOT NULL,
    sent_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reminders_period (subscription_id, type, period_end),
    KEY idx_reminders_status (status),
    CONSTRAINT fk_reminders_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const dropOrder = [
  'subscription_reminders',
  'check_ins',
  'payments',
  'subscription_events',
  'subscriptions',
  'membership_plans',
  'members',
  'password_reset_tokens',
  'refresh_tokens',
  'users',
];

function errorCode(error) {
  return error?.original?.code || error?.parent?.code || error?.code;
}

async function run(context, sql) {
  try {
    await context.sequelize.query(sql);
  } catch (error) {
    const code = errorCode(error);
    if (ALREADY_EXISTS.has(code)) {
      console.warn(`Skipped statement because it already exists (${code}).`);
      return;
    }
    console.error('Migration statement failed.');
    console.error(sql);
    console.error(error);
    throw error;
  }
}

const subscriptionForeignKeys = [
  ['fk_subscriptions_member', 'FOREIGN KEY (member_id) REFERENCES members (id) ON UPDATE CASCADE ON DELETE RESTRICT'],
  ['fk_subscriptions_plan', 'FOREIGN KEY (plan_id) REFERENCES membership_plans (id) ON UPDATE CASCADE ON DELETE RESTRICT'],
  ['fk_subscriptions_scheduled_plan', 'FOREIGN KEY (scheduled_plan_id) REFERENCES membership_plans (id) ON UPDATE CASCADE ON DELETE RESTRICT'],
  ['fk_subscriptions_created_by', 'FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL'],
  ['fk_subscriptions_renewed_from', 'FOREIGN KEY (renewed_from_id) REFERENCES subscriptions (id) ON UPDATE CASCADE ON DELETE SET NULL'],
];

async function rowsOf(context, sql, replacements) {
  const [rows] = await context.sequelize.query(sql, { replacements });
  return Array.isArray(rows) ? rows : [];
}

async function ensureOpenMemberKey(context) {
  const columns = await rowsOf(
    context,
    `SELECT GENERATION_EXPRESSION AS expression
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'open_member_key'`,
  );
  const expression = columns[0]?.expression ?? columns[0]?.GENERATION_EXPRESSION ?? '';
  const generated = String(expression).length > 0;

  if (generated) {
    await context.sequelize.query('ALTER TABLE subscriptions DROP INDEX uq_subscriptions_open_member');
    await context.sequelize.query('ALTER TABLE subscriptions DROP COLUMN open_member_key');
  }

  if (generated || columns.length === 0) {
    await context.sequelize.query('ALTER TABLE subscriptions ADD COLUMN open_member_key CHAR(36) NULL');
    await context.sequelize.query(
      'ALTER TABLE subscriptions ADD UNIQUE KEY uq_subscriptions_open_member (open_member_key)',
    );
  }

  const triggerBody =
    "IF(NEW.status IN ('pending', 'active', 'paused'), NEW.member_id, NULL)";
  const triggers = [
    ['subscriptions_open_key_insert', 'BEFORE INSERT'],
    ['subscriptions_open_key_update', 'BEFORE UPDATE'],
  ];
  for (const [name, timing] of triggers) {
    const existing = await rowsOf(
      context,
      `SELECT TRIGGER_NAME AS name
       FROM INFORMATION_SCHEMA.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = :name`,
      { name },
    );
    if (existing.length > 0) continue;
    await context.sequelize.query(
      `CREATE TRIGGER ${name} ${timing} ON subscriptions FOR EACH ROW SET NEW.open_member_key = ${triggerBody}`,
    );
  }

  for (const [name, definition] of subscriptionForeignKeys) {
    await run(context, `ALTER TABLE subscriptions ADD CONSTRAINT ${name} ${definition}`);
  }
}

async function up({ context }) {
  try {
    for (const sql of statements) {
      await run(context, sql);
    }
    await ensureOpenMemberKey(context);
  } catch (error) {
    console.error('Migration 20261011000001-init-schema failed.');
    console.error(error);
    throw error;
  }
}

async function down({ context }) {
  try {
    for (const table of dropOrder) {
      await run(context, `DROP TABLE IF EXISTS ${table}`);
    }
  } catch (error) {
    console.error('Rollback of 20261011000001-init-schema failed.');
    console.error(error);
    throw error;
  }
}

module.exports = { up, down };

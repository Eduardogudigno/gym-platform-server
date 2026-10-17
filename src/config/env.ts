import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  DEFAULT_CURRENCY: z
    .string()
    .length(3)
    .default('USD')
    .transform((value) => value.toUpperCase()),
  BUSINESS_TIMEZONE: z.string().default('UTC'),
  SUBSCRIPTION_PENDING_TTL_HOURS: z.coerce.number().int().positive().default(72),
  REMINDER_DAYS: z.string().default('7,3,1'),
  ENABLE_CRON: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  CRON_SCHEDULE: z.string().default('*/15 * * * *'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@gym.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  SEED_ADMIN_FIRST_NAME: z.string().default('System'),
  SEED_ADMIN_LAST_NAME: z.string().default('Admin'),
  SEED_DEMO_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  PAYMENT_GATEWAY: z.enum(['manual', 'stripe']).default('manual'),
  WEBHOOK_SECRET: z.string().default(''),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment: ${details.join('; ')}`);
}

const reminderDays = parsed.data.REMINDER_DAYS.split(',')
  .map((part) => Number(part.trim()))
  .filter((day) => day === 7 || day === 3 || day === 1);

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  logLevel: parsed.data.LOG_LEVEL,
  trustProxy: parsed.data.TRUST_PROXY,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  dbHost: parsed.data.DB_HOST,
  dbPort: parsed.data.DB_PORT,
  dbName: parsed.data.DB_NAME,
  dbUser: parsed.data.DB_USER,
  dbPassword: parsed.data.DB_PASSWORD,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  jwtAccessTtl: parsed.data.JWT_ACCESS_TTL,
  jwtRefreshTtl: parsed.data.JWT_REFRESH_TTL,
  bcryptRounds: parsed.data.BCRYPT_ROUNDS,
  defaultCurrency: parsed.data.DEFAULT_CURRENCY,
  businessTimezone: parsed.data.BUSINESS_TIMEZONE,
  pendingTtlHours: parsed.data.SUBSCRIPTION_PENDING_TTL_HOURS,
  reminderDays: reminderDays.length > 0 ? reminderDays : [7, 3, 1],
  enableCron: parsed.data.ENABLE_CRON,
  cronSchedule: parsed.data.CRON_SCHEDULE,
  rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: parsed.data.RATE_LIMIT_MAX,
  authRateLimitWindowMs: parsed.data.AUTH_RATE_LIMIT_WINDOW_MS,
  authRateLimitMax: parsed.data.AUTH_RATE_LIMIT_MAX,
  seedAdminEmail: parsed.data.SEED_ADMIN_EMAIL,
  seedAdminPassword: parsed.data.SEED_ADMIN_PASSWORD,
  seedAdminFirstName: parsed.data.SEED_ADMIN_FIRST_NAME,
  seedAdminLastName: parsed.data.SEED_ADMIN_LAST_NAME,
  seedDemoPassword: parsed.data.SEED_DEMO_PASSWORD,
  paymentGateway: parsed.data.PAYMENT_GATEWAY,
  webhookSecret: parsed.data.WEBHOOK_SECRET,
  stripeSecretKey: parsed.data.STRIPE_SECRET_KEY,
  stripeWebhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
};

export type Env = typeof env;

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { ensureDatabase } from './database/ensure-database';
import { sequelize } from './database/models';
import { container } from './container';
import { runSubscriptionJobs, startScheduler } from './jobs/scheduler';

async function main(): Promise<void> {
  try {
    await ensureDatabase();
  } catch (error) {
    logger.error({ err: error }, 'could not create or reach the database');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, 'gym-api listening');
  });

  startScheduler(async () => {
    const result = await runSubscriptionJobs(container.subscriptions, container.reminders);
    logger.info(result, 'subscription job finished');
  });

  async function shutdown(): Promise<void> {
    server.close();
    await sequelize.close();
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main();

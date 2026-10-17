import { Sequelize } from 'sequelize';
import { env } from '../config/env';
import { logger } from '../config/logger';

const DATABASE_NAME = /^[A-Za-z0-9_]+$/;

export async function ensureDatabase(): Promise<void> {
  if (!DATABASE_NAME.test(env.dbName)) {
    throw new Error('DB_NAME may only contain letters, numbers, and underscores');
  }

  const connection = new Sequelize({
    dialect: 'mysql',
    host: env.dbHost,
    port: env.dbPort,
    username: env.dbUser,
    password: env.dbPassword,
    logging: false,
  });

  try {
    const [rows] = await connection.query(
      'SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = :name',
      { replacements: { name: env.dbName } },
    );
    const exists = Array.isArray(rows) && rows.length > 0;
    if (exists) {
      logger.info({ database: env.dbName }, 'database already exists');
      return;
    }

    await connection.query(
      `CREATE DATABASE \`${env.dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    logger.info({ database: env.dbName }, 'database created');
  } catch (error) {
    logger.error({ err: error, database: env.dbName }, 'failed to ensure database');
    throw error;
  } finally {
    await connection.close();
  }
}

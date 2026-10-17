import { Sequelize } from 'sequelize-typescript';
import { env } from './env';
import { logger } from './logger';

export const sequelize = new Sequelize({
  database: env.dbName,
  username: env.dbUser,
  password: env.dbPassword,
  host: env.dbHost,
  port: env.dbPort,
  dialect: 'mysql',
  logging: env.nodeEnv === 'development' ? (sql) => logger.debug(sql) : false,
  timezone: '+00:00',
  define: {
    underscored: true,
    freezeTableName: true,
  },
  dialectOptions: {
    charset: 'utf8mb4',
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

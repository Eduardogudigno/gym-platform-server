import 'reflect-metadata';
import cors from 'cors';
import express, { type Express, Router, type Request } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './common/errors/error-handler';
import { asyncHandler } from './common/middleware/validate';
import { apiLimiter } from './common/middleware/rate-limit';
import { fail, ok } from './common/responses/api-response';
import { mountApi } from './container';
import { sequelize } from './database/models';
import { docsRouter } from './docs/swagger';

export function createApp(): Express {
  const app = express();
  if (env.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Gym-Signature'],
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: env.nodeEnv !== 'test' }));
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        if (req.url?.includes('/webhooks/payments/')) {
          (req as Request).rawBody = buf;
        }
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });
  app.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      try {
        await sequelize.authenticate();
        res.json(ok({ status: 'ok', database: 'up' }));
      } catch (error) {
        logger.error({ err: error }, 'database unavailable');
        res.status(503).json(fail('DATABASE_UNAVAILABLE', 'Database is not reachable'));
      }
    }),
  );
  app.use('/docs', docsRouter());

  const api = Router();
  mountApi(api);
  app.use('/api', apiLimiter);
  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

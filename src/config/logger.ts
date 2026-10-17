import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.body.password',
      'req.body.newPassword',
      'req.body.refreshToken',
      'req.body.token',
      'res.body.accessToken',
      'res.body.refreshToken',
    ],
    remove: true,
  },
});

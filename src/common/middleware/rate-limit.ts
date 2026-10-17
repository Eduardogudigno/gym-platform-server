import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { fail } from '../responses/api-response';

function limited(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(fail('RATE_LIMITED', message));
    },
  });
}

export const apiLimiter = limited(env.rateLimitWindowMs, env.rateLimitMax, 'Too many requests');

export const authLimiter = limited(
  env.authRateLimitWindowMs,
  env.authRateLimitMax,
  'Too many authentication attempts',
);

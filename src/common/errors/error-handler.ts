import type { NextFunction, Request, Response } from 'express';
import { ForeignKeyConstraintError, UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { AppError } from './app-error';
import { fail } from '../responses/api-response';

function conflictFromUnique(error: UniqueConstraintError): AppError {
  const fields = Object.keys(error.fields ?? {});
  const joined = fields.join(',');
  if (joined.includes('email')) {
    return new AppError(409, 'EMAIL_IN_USE', 'Email is already in use');
  }
  if (joined.includes('open_member_key')) {
    return new AppError(409, 'SUBSCRIPTION_ALREADY_OPEN', 'Member already has an open subscription');
  }
  if (joined.includes('idempotency')) {
    return new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used');
  }
  return new AppError(409, 'CONFLICT', 'Unique constraint violated');
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(fail('NOT_FOUND', 'Route not found'));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(fail(err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json(
      fail(
        'VALIDATION_ERROR',
        'Request validation failed',
        err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      ),
    );
    return;
  }

  if (err instanceof UniqueConstraintError) {
    const appError = conflictFromUnique(err);
    res.status(appError.statusCode).json(fail(appError.code, appError.message));
    return;
  }

  if (err instanceof ForeignKeyConstraintError) {
    res.status(409).json(fail('INVALID_REFERENCE', 'Referenced record does not exist'));
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json(fail('INVALID_JSON', 'Malformed JSON body'));
    return;
  }

  logger.error({ err, path: req.path, requestId: req.id }, 'unhandled error');
  const message = env.nodeEnv === 'production' ? 'Internal server error' : messageOf(err);
  res.status(500).json(fail('INTERNAL_ERROR', message));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Internal server error';
}

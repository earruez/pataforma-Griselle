import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ status: 'error', code: 'CONFLICT', message: 'A record with this value already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Record not found' });
      return;
    }
  }

  if (err instanceof AppError) {
    if (!err.isOperational) logger.fatal({ err }, 'Non-operational error');
    else logger.warn({ err }, 'Operational error');
    res.status(err.statusCode).json({
      status: 'error',
      code: err.code ?? 'APPLICATION_ERROR',
      message: err.message,
      ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
    return;
  }

  logger.error({ err }, 'Unexpected error');
  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { UnauthorizedError } from '../../../shared/errors/AppError';

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.organizationId) {
    req.organizationId = req.currentUser?.organizationId;
  }
  next();
}

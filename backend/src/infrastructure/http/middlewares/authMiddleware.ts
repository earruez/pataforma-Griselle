import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/AppError';
import { UserRole } from '../../../domain/entities/User';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next(new UnauthorizedError('No Bearer token provided'));

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.currentUser = { id: payload.sub, email: payload.email, role: payload.role, organizationId: payload.organizationId };
    req.organizationId = payload.organizationId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.currentUser) return next(new UnauthorizedError());
    if (!roles.includes(req.currentUser.role)) return next(new ForbiddenError(`Role '${req.currentUser.role}' is not allowed`));
    next();
  };
}

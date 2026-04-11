import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { LoginUseCase } from '../../../application/auth/LoginUseCase';
import { prisma } from '../../database/prisma.client';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  organization: z.string().min(1), // accepts UUID or slug
});

export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, organization } = loginSchema.parse(req.body);

      // Resolve slug OR uuid → organizationId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let organizationId: string;
      if (uuidRegex.test(organization)) {
        organizationId = organization;
      } else {
        const org = await prisma.organization.findUnique({ where: { slug: organization } });
        if (!org) {
          res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Invalid credentials' });
          return;
        }
        organizationId = org.id;
      }

      const result = await this.loginUseCase.execute({ email, password, organizationId });
      res.status(200).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /auth/me — validates that the token's organizationId still exists.
   * Called on frontend startup to detect stale sessions after a DB reseed.
   */
  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const org = await prisma.organization.findUnique({ where: { id: req.organizationId } });
      if (!org) {
        res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Organization no longer exists — please log in again' });
        return;
      }
      const user = await prisma.user.findUnique({ where: { id: req.currentUser!.id } });
      if (!user) {
        res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'User no longer exists — please log in again' });
        return;
      }
      res.status(200).json({ status: 'success', data: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId } });
    } catch (err) {
      next(err);
    }
  };
}

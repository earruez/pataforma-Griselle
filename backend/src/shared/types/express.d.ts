import { UserRole } from '../../domain/entities/User';

declare global {
  namespace Express {
    interface Request {
      organizationId: string;
      currentUser: {
        id: string;
        email: string;
        role: UserRole;
        organizationId: string;
      };
    }
  }
}

export {};

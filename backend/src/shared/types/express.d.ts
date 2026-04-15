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
      // Add user shorthand for easier access
      user?: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        organizationId: string;
        isActive?: boolean;
      };
      // Add file for multer integration
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
    }
  }
}

export {};

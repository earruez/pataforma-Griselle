import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { LoginUseCase } from '../../../application/auth/LoginUseCase';
import { PrismaUserRepository } from '../../database/repositories/PrismaUserRepository';

const router = Router();
const ctrl = new AuthController(new LoginUseCase(new PrismaUserRepository()));

router.post('/login', ctrl.login);

export { router as authRoutes };

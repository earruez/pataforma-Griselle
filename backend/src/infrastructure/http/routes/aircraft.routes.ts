import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { tenantMiddleware } from '../middlewares/tenantMiddleware';
import { AircraftController } from '../controllers/AircraftController';
import {
  CreateAircraftUseCase,
  GetAircraftUseCase,
  UpdateAircraftUseCase,
} from '../../../application/aircraft/AircraftUseCases';
import { PrismaAircraftRepository } from '../../database/repositories/PrismaAircraftRepository';

const router = Router();
const repo = new PrismaAircraftRepository();
const ctrl = new AircraftController(
  new CreateAircraftUseCase(repo),
  new GetAircraftUseCase(repo),
  new UpdateAircraftUseCase(repo),
);

router.use(authMiddleware, tenantMiddleware);
router.get('/', ctrl.findAll);
router.get('/:id', ctrl.findById);
router.post('/', ctrl.create);
router.patch('/:id', ctrl.update);

export { router as aircraftRoutes };

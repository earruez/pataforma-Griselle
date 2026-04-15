import { Router } from 'express';
import { GrisselleMroController } from '../controllers/GrisselleMroController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { tenantMiddleware } from '../middlewares/tenantMiddleware';
import { upload } from '../middlewares/upload';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/aeronave/:id/ingenieria', GrisselleMroController.getEngineeringGrid);
router.post('/solicitud-trabajo', requireRoles('ADMIN', 'SUPERVISOR'), GrisselleMroController.createWorkRequest);
router.put(
  '/cumplimiento/:id',
  requireRoles('ADMIN', 'SUPERVISOR', 'INSPECTOR'),
  upload.single('evidence'),
  GrisselleMroController.closeCompliance,
);
router.get('/historial/:tareaId', GrisselleMroController.getTaskHistory);

export { router as grisselleMroRoutes };
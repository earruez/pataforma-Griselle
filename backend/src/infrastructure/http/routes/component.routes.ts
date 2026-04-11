import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware';
import { tenantMiddleware } from '../middlewares/tenantMiddleware';
import { PrismaComponentRepository } from '../../database/repositories/PrismaComponentRepository';

const router = Router();
const repo = new PrismaComponentRepository();

const createSchema = z.object({
  partNumber:   z.string().min(1).max(100),
  serialNumber: z.string().min(1).max(100),
  description:  z.string().min(1).max(255),
  manufacturer: z.string().min(1).max(150),
  aircraftId:   z.string().uuid().optional().nullable(),
  position:     z.string().max(150).optional().nullable(),
  tboHours:     z.number().nonnegative().optional().nullable(),
  tboCycles:    z.number().int().nonnegative().optional().nullable(),
  tboCalendarDays: z.number().int().nonnegative().optional().nullable(),
  lifeLimitHours:  z.number().nonnegative().optional().nullable(),
  lifeLimitCycles: z.number().int().nonnegative().optional().nullable(),
});

router.use(authMiddleware, tenantMiddleware);

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.parse(req.body);
    const data = await repo.create({
      ...body,
      organizationId: req.organizationId,
      aircraftId:     body.aircraftId     ?? null,
      position:       body.position       ?? null,
      tboHours:       body.tboHours       ?? null,
      tboCycles:      body.tboCycles      ?? null,
      tboCalendarDays: body.tboCalendarDays ?? null,
      lifeLimitHours:  body.lifeLimitHours  ?? null,
      lifeLimitCycles: body.lifeLimitCycles ?? null,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) { next(err); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await repo.findAll(req.organizationId, { page: 1, limit: 100 });
    res.status(200).json({ status: 'success', data: result.data });
  } catch (err) { next(err); }
});

router.get('/aircraft/:aircraftId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await repo.findByAircraft(req.params.aircraftId, req.organizationId);
    res.status(200).json({ status: 'success', data });
  } catch (err) { next(err); }
});

export { router as componentRoutes };

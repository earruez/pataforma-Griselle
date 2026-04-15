import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware';
import { tenantMiddleware } from '../middlewares/tenantMiddleware';
import { PrismaComponentRepository } from '../../database/repositories/PrismaComponentRepository';
import { prisma } from '../../database/prisma.client';

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

const updateSchema = z.object({
  partNumber: z.string().min(1).max(100).optional(),
  serialNumber: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(255).optional(),
  manufacturer: z.string().min(1).max(150).optional(),
  position: z.string().max(150).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const installationSchema = z.object({
  aircraftId: z.string().uuid(),
  installationDate: z.coerce.date(),
  position: z.string().max(150).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
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

router.get('/:id/compliances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.compliance.findMany({
      where: {
        componentId: req.params.id,
        organizationId: req.organizationId,
      },
      include: {
        task: {
          select: {
            id: true,
            code: true,
            title: true,
            referenceType: true,
            referenceNumber: true,
          },
        },
        performedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSchema.parse(req.body);
    const data = await repo.update(req.params.id, req.organizationId, {
      partNumber: body.partNumber,
      serialNumber: body.serialNumber,
      description: body.description,
      manufacturer: body.manufacturer,
      position: body.position,
      notes: body.notes,
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/installation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = installationSchema.parse(req.body);

    const component = await repo.findById(req.params.id, req.organizationId);
    if (!component) {
      return res.status(404).json({ status: 'error', message: 'Component not found' });
    }

    const aircraft = await prisma.aircraft.findFirst({
      where: { id: body.aircraftId, organizationId: req.organizationId },
    });
    if (!aircraft) {
      return res.status(404).json({ status: 'error', message: 'Aircraft not found' });
    }

    const data = await repo.update(req.params.id, req.organizationId, {
      aircraftId: body.aircraftId,
      position: body.position ?? component.position,
      installationDate: body.installationDate,
      installationAircraftHours: Number(aircraft.totalFlightHours),
      installationAircraftCycles: aircraft.totalCycles,
      status: 'INSTALLED',
      notes: body.notes ?? component.notes,
    });

    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

export { router as componentRoutes };

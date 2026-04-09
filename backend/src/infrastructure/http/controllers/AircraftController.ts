import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  CreateAircraftUseCase,
  GetAircraftUseCase,
  UpdateAircraftUseCase,
} from '../../../application/aircraft/AircraftUseCases';

const createSchema = z.object({
  registration: z.string().min(1).max(20).toUpperCase(),
  model: z.string().min(1).max(150),
  manufacturer: z.string().min(1).max(150),
  serialNumber: z.string().min(1).max(100),
  engineCount: z.number().int().min(1).max(4).default(2),
  engineModel: z.string().max(100).optional().nullable(),
  manufactureDate: z.coerce.date().optional().nullable(),
  registrationDate: z.coerce.date().optional().nullable(),
  coaExpiryDate: z.coerce.date().optional().nullable(),
  insuranceExpiryDate: z.coerce.date().optional().nullable(),
});

const updateSchema = z.object({
  model: z.string().max(150).optional(),
  manufacturer: z.string().max(150).optional(),
  serialNumber: z.string().max(100).optional(),
  engineModel: z.string().max(100).optional().nullable(),
  totalFlightHours: z.number().nonnegative().optional(),
  totalCycles: z.number().int().nonnegative().optional(),
  status: z.enum(['OPERATIONAL', 'AOG', 'IN_MAINTENANCE', 'GROUNDED', 'DECOMMISSIONED']).optional(),
  coaExpiryDate: z.coerce.date().optional().nullable(),
  insuranceExpiryDate: z.coerce.date().optional().nullable(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class AircraftController {
  constructor(
    private readonly createUseCase: CreateAircraftUseCase,
    private readonly getUseCase: GetAircraftUseCase,
    private readonly updateUseCase: UpdateAircraftUseCase,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const aircraft = await this.createUseCase.execute({ ...body, organizationId: req.organizationId });
      res.status(201).json({ status: 'success', data: aircraft });
    } catch (err) { next(err); }
  };

  findAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await this.getUseCase.findAll(req.organizationId, { page, limit });
      res.status(200).json({ status: 'success', ...result });
    } catch (err) { next(err); }
  };

  findById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const aircraft = await this.getUseCase.findById(req.params.id, req.organizationId);
      res.status(200).json({ status: 'success', data: aircraft });
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = updateSchema.parse(req.body);
      const aircraft = await this.updateUseCase.execute(req.params.id, req.organizationId, body);
      res.status(200).json({ status: 'success', data: aircraft });
    } catch (err) { next(err); }
  };
}

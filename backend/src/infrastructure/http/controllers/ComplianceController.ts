import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RecordComplianceUseCase, GetComplianceUseCase } from '../../../application/maintenance/ComplianceUseCases';

const recordSchema = z.object({
  aircraftId: z.string().uuid(),
  taskId: z.string().uuid(),
  componentId: z.string().uuid().optional().nullable(),
  performedAt: z.coerce.date(),
  inspectedById: z.string().uuid().optional().nullable(),
  workOrderNumber: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
  deferralReference: z.string().max(100).optional().nullable(),
  deferralExpiresAt: z.coerce.date().optional().nullable(),
});

export class ComplianceController {
  constructor(
    private readonly recordUseCase: RecordComplianceUseCase,
    private readonly getUseCase: GetComplianceUseCase,
  ) {}

  record = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = recordSchema.parse(req.body);
      const compliance = await this.recordUseCase.execute({
        ...body,
        organizationId: req.organizationId,
        performedById: req.currentUser.id,
      });
      res.status(201).json({ status: 'success', data: compliance });
    } catch (err) { next(err); }
  };

  latestPerTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.getUseCase.getLatestPerTask(req.params.aircraftId, req.organizationId);
      res.status(200).json({ status: 'success', data });
    } catch (err) { next(err); }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ComponentHistoryController  —  Historial de instalación/remoción
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ComponentMovementType } from '@prisma/client';
import { componentHistoryService } from '../../../domain/services/ComponentHistoryService';

const MOVEMENT_TYPES = ['INSTALLED', 'REMOVED'] as const;

const recordSchema = z.object({
  aircraftId:                z.string().uuid(),
  movementType:              z.enum(MOVEMENT_TYPES),
  aircraftHoursAtMovement:   z.number().nonnegative(),
  aircraftCyclesAtMovement:  z.number().int().nonnegative(),
  componentHoursAtMovement:  z.number().nonnegative(),
  componentCyclesAtMovement: z.number().int().nonnegative(),
  position:                  z.string().max(150).optional().nullable(),
  workOrderId:               z.string().uuid().optional().nullable(),
  notes:                     z.string().optional().nullable(),
  movedAt:                   z.string().datetime(),
});

export class ComponentHistoryController {

  // ── Record a movement (install or removal) ─────────────────────────────────
  record = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = recordSchema.parse(req.body);
      const input = {
        ...body,
        movementType: body.movementType as ComponentMovementType,
        movedAt: new Date(body.movedAt),
      };
      const data = await componentHistoryService.record(
        req.params.componentId,
        input,
        req.organizationId,
        req.currentUser,
      );
      res.status(201).json({ status: 'success', data });
    } catch (err) { next(err); }
  };

  // ── Get history for a component ────────────────────────────────────────────
  getByComponent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await componentHistoryService.getByComponent(
        req.params.componentId,
        req.organizationId,
      );
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };

  // ── Get history for an aircraft ────────────────────────────────────────────
  getByAircraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await componentHistoryService.getByAircraft(
        req.params.aircraftId,
        req.organizationId,
      );
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };
}

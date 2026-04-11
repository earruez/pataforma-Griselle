// ─────────────────────────────────────────────────────────────────────────────
//  DiscrepancyController  —  Hallazgos / Discrepancias within a Work Order
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { discrepancyService } from '../../../domain/services/DiscrepancyService';

const DISC_STATUSES = ['OPEN', 'DEFERRED', 'RESOLVED', 'CANCELLED'] as const;

const createSchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().min(1),
  location:    z.string().max(150).optional().nullable(),
  ataChapter:  z.string().max(20).optional().nullable(),
});

const updateSchema = z.object({
  title:           z.string().min(1).max(255).optional(),
  description:     z.string().min(1).optional(),
  location:        z.string().max(150).optional().nullable(),
  ataChapter:      z.string().max(20).optional().nullable(),
  status:          z.enum(DISC_STATUSES).optional(),
  resolutionNotes: z.string().optional().nullable(),
  deferralRef:     z.string().max(100).optional().nullable(),
  deferralExpiresAt: z.string().datetime().optional().nullable(),
});

export class DiscrepancyController {

  // ── List for a WO ──────────────────────────────────────────────────────────
  listForWorkOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await discrepancyService.list(req.params.workOrderId, req.organizationId);
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };

  // ── Get by ID ──────────────────────────────────────────────────────────────
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await discrepancyService.getById(req.params.id, req.organizationId);
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };

  // ── Create ─────────────────────────────────────────────────────────────────
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body  = createSchema.parse(req.body);
      const data  = await discrepancyService.create(
        req.params.workOrderId,
        body,
        req.organizationId,
        req.currentUser,
      );
      res.status(201).json({ status: 'success', data });
    } catch (err) { next(err); }
  };

  // ── Update / resolve / defer ───────────────────────────────────────────────
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = updateSchema.parse(req.body);
      const input = {
        ...body,
        deferralExpiresAt: body.deferralExpiresAt ? new Date(body.deferralExpiresAt) : (body.deferralExpiresAt as null | undefined),
      };
      const data = await discrepancyService.update(req.params.id, input, req.organizationId, req.currentUser);
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  AuditLogController  —  Read-only audit trail endpoints
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { auditLogService } from '../../../domain/services/AuditLogService';

export class AuditLogController {

  // ── GET /api/v1/audit-logs/:entityType/:entityId
  getForEntity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await auditLogService.getForEntity(
        req.params.entityType,
        req.params.entityId,
        req.organizationId,
      );
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };

  // ── GET /api/v1/work-orders/:id/audit-log
  getForWorkOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await auditLogService.getForWorkOrder(req.params.id, req.organizationId);
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  };
}

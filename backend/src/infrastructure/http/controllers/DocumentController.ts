// ─────────────────────────────────────────────────────────────────────────────
//  DocumentController  —  OT Summary document generation
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { documentService } from '../../../domain/services/DocumentService';

export class DocumentController {

  /**
   * GET /api/v1/work-orders/:id/document
   * Returns a structured JSON document ready for PDF rendering.
   */
  generateOTSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doc = await documentService.generateOTSummary(
        req.params.id,
        req.organizationId,
        req.currentUser.id,
      );
      res.json({ status: 'success', data: doc });
    } catch (err) { next(err); }
  };
}

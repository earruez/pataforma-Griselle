// ─────────────────────────────────────────────────────────────────────────────
//  Component History routes
//  Base: /api/v1/components (extends existing component routes)
//        /api/v1/aircraft/:aircraftId/component-history
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { tenantMiddleware } from '../middlewares/tenantMiddleware';
import { ComponentHistoryController } from '../controllers/ComponentHistoryController';
import { AuditLogController } from '../controllers/AuditLogController';

const componentHistoryRouter = Router();
const ctrl  = new ComponentHistoryController();
const audit = new AuditLogController();

componentHistoryRouter.use(authMiddleware);
componentHistoryRouter.use(tenantMiddleware);

// ── Component movements ────────────────────────────────────────────────────
componentHistoryRouter.get('/:componentId/history',   ctrl.getByComponent);
componentHistoryRouter.post('/:componentId/history',  ctrl.record);

export { componentHistoryRouter };

// ── Aircraft-centric view ─────────────────────────────────────────────────
const aircraftHistoryRouter = Router();
aircraftHistoryRouter.use(authMiddleware);
aircraftHistoryRouter.use(tenantMiddleware);
aircraftHistoryRouter.get('/:aircraftId/component-history', ctrl.getByAircraft);

export { aircraftHistoryRouter };

// ── Generic audit log ──────────────────────────────────────────────────────
const auditRouter = Router();
auditRouter.use(authMiddleware);
auditRouter.use(tenantMiddleware);
const auditCtrl = new AuditLogController();
auditRouter.get('/:entityType/:entityId', auditCtrl.getForEntity);

export { auditRouter };

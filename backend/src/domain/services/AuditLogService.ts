// ─────────────────────────────────────────────────────────────────────────────
//  AuditLogService  —  Append-only immutable audit trail for DGAC compliance
//  CRITICAL: This service must NEVER expose update or delete operations.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../infrastructure/database/prisma.client';

export interface AuditLogPayload {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  userId: string;
  userEmail: string;
  userRole: string;
  workOrderId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class AuditLogService {
  /**
   * Append a single immutable log entry.
   * This method has no update path — call it and forget.
   */
  async log(payload: AuditLogPayload) {
    return prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId,
        entityType:     payload.entityType,
        entityId:       payload.entityId,
        action:         payload.action,
        previousValue:  payload.previousValue ? (payload.previousValue as object) : undefined,
        newValue:       payload.newValue       ? (payload.newValue       as object) : undefined,
        userId:         payload.userId,
        userEmail:      payload.userEmail,
        userRole:       payload.userRole,
        workOrderId:    payload.workOrderId ?? null,
        metadata:       payload.metadata       ? (payload.metadata       as object) : undefined,
      },
    });
  }

  /**
   * Read logs for a specific entity — used by audit trail UI.
   * Returns newest entries first.
   */
  async getForEntity(entityType: string, entityId: string, organizationId: string) {
    return prisma.auditLog.findMany({
      where: { entityType, entityId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Read all logs for a work order (including nested entity changes).
   */
  async getForWorkOrder(workOrderId: string, organizationId: string) {
    return prisma.auditLog.findMany({
      where: { workOrderId, organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export const auditLogService = new AuditLogService();

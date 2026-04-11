// ─────────────────────────────────────────────────────────────────────────────
//  ComponentHistoryService  —  Historial de instalación/remoción de componentes
//  Append-only. No updates, no deletes.
// ─────────────────────────────────────────────────────────────────────────────

import { ComponentMovementType, UserRole } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.client';
import { auditLogService } from './AuditLogService';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';

export interface RecordMovementInput {
  aircraftId:               string;
  movementType:             ComponentMovementType;
  aircraftHoursAtMovement:  number;
  aircraftCyclesAtMovement: number;
  componentHoursAtMovement: number;
  componentCyclesAtMovement: number;
  position?:                string | null;
  workOrderId?:             string | null;
  notes?:                   string | null;
  movedAt:                  Date;
}

export class ComponentHistoryService {

  // ── Record an installation or removal ─────────────────────────────────────
  async record(
    componentId: string,
    input: RecordMovementInput,
    organizationId: string,
    currentUser: { id: string; email: string; role: UserRole },
  ) {
    // Validate component belongs to org
    const component = await prisma.component.findFirst({
      where: { id: componentId, organizationId },
    });
    if (!component) throw new NotFoundError('Component', componentId);

    // Validate aircraft belongs to org
    const aircraft = await prisma.aircraft.findFirst({
      where: { id: input.aircraftId, organizationId },
    });
    if (!aircraft) throw new NotFoundError('Aircraft', input.aircraftId);

    // Validate work order (if provided)
    if (input.workOrderId) {
      const wo = await prisma.workOrder.findFirst({
        where: { id: input.workOrderId, organizationId },
      });
      if (!wo) throw new NotFoundError('WorkOrder', input.workOrderId);
    }

    // Business rule: must have an INSTALLED record before recording REMOVED
    if (input.movementType === 'REMOVED') {
      const lastMovement = await prisma.componentHistory.findFirst({
        where: { componentId, organizationId },
        orderBy: { movedAt: 'desc' },
      });
      if (lastMovement?.movementType !== 'INSTALLED') {
        throw new ValidationError('Cannot record REMOVED movement — component is not currently installed according to history');
      }
    }

    const history = await prisma.$transaction(async (tx) => {
      const entry = await tx.componentHistory.create({
        data: {
          organizationId,
          componentId,
          aircraftId:                input.aircraftId,
          movementType:              input.movementType,
          aircraftHoursAtMovement:   input.aircraftHoursAtMovement,
          aircraftCyclesAtMovement:  input.aircraftCyclesAtMovement,
          componentHoursAtMovement:  input.componentHoursAtMovement,
          componentCyclesAtMovement: input.componentCyclesAtMovement,
          position:                  input.position ?? null,
          workOrderId:               input.workOrderId ?? null,
          performedById:             currentUser.id,
          notes:                     input.notes ?? null,
          movedAt:                   input.movedAt,
        },
        include: this.include,
      });

      // Update component current status and aircraft reference
      const newStatus = input.movementType === 'INSTALLED' ? 'INSTALLED' : 'SERVICEABLE';
      await tx.component.update({
        where: { id: componentId },
        data: {
          status:   newStatus,
          aircraftId: input.movementType === 'INSTALLED' ? input.aircraftId : null,
          // Update life tracking when installed/removed
          totalHoursSinceNew:   { increment: 0 },   // caller is responsible for updating via separate API
          installationDate:     input.movementType === 'INSTALLED' ? input.movedAt : null,
          installationAircraftHours:  input.movementType === 'INSTALLED' ? input.aircraftHoursAtMovement : null,
          installationAircraftCycles: input.movementType === 'INSTALLED' ? input.aircraftCyclesAtMovement : null,
          position: input.movementType === 'INSTALLED' ? (input.position ?? null) : null,
        },
      });

      return entry;
    });

    await auditLogService.log({
      organizationId,
      entityType:   'Component',
      entityId:     componentId,
      action:       `COMPONENT_${input.movementType}`,
      previousValue: { status: component.status, aircraftId: component.aircraftId },
      newValue:      {
        status: input.movementType === 'INSTALLED' ? 'INSTALLED' : 'SERVICEABLE',
        aircraftId: input.movementType === 'INSTALLED' ? input.aircraftId : null,
        aircraftHoursAtMovement: input.aircraftHoursAtMovement,
      },
      userId:        currentUser.id,
      userEmail:     currentUser.email,
      userRole:      currentUser.role,
      workOrderId:   input.workOrderId ?? undefined,
    });

    return history;
  }

  // ── Get full history for a component ──────────────────────────────────────
  async getByComponent(componentId: string, organizationId: string) {
    // Verify component belongs to org
    const component = await prisma.component.findFirst({
      where: { id: componentId, organizationId },
      select: { id: true, partNumber: true, serialNumber: true, description: true },
    });
    if (!component) throw new NotFoundError('Component', componentId);

    const history = await prisma.componentHistory.findMany({
      where: { componentId, organizationId },
      include: this.include,
      orderBy: { movedAt: 'desc' },
    });

    return { component, history };
  }

  // ── Get installation history for an aircraft ───────────────────────────────
  async getByAircraft(aircraftId: string, organizationId: string) {
    const aircraft = await prisma.aircraft.findFirst({
      where: { id: aircraftId, organizationId },
      select: { id: true, registration: true },
    });
    if (!aircraft) throw new NotFoundError('Aircraft', aircraftId);

    const history = await prisma.componentHistory.findMany({
      where: { aircraftId, organizationId },
      include: { ...this.include, component: { select: { id: true, partNumber: true, serialNumber: true, description: true } } },
      orderBy: { movedAt: 'desc' },
    });

    return { aircraft, history };
  }

  private readonly include = {
    aircraft:     { select: { id: true, registration: true } },
    performedBy:  { select: { id: true, name: true, role: true } },
    workOrder:    { select: { id: true, number: true } },
  };
}

export const componentHistoryService = new ComponentHistoryService();

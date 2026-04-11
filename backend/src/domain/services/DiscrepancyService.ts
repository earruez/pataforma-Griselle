// ─────────────────────────────────────────────────────────────────────────────
//  DiscrepancyService  —  Non-routine findings/hallazgos within a Work Order
// ─────────────────────────────────────────────────────────────────────────────

import { DiscrepancyStatus, UserRole } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.client';
import { auditLogService } from './AuditLogService';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';

export interface CreateDiscrepancyInput {
  title: string;
  description: string;
  location?: string | null;
  ataChapter?: string | null;
}

export interface UpdateDiscrepancyInput {
  title?: string;
  description?: string;
  location?: string | null;
  ataChapter?: string | null;
  status?: DiscrepancyStatus;
  resolutionNotes?: string | null;
  deferralRef?: string | null;
  deferralExpiresAt?: Date | null;
}

export class DiscrepancyService {

  // ── Generate sequential code ───────────────────────────────────────────────
  private async generateCode(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.discrepancy.count({
      where: { organizationId, code: { startsWith: `DC-${year}-` } },
    });
    return `DC-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async create(
    workOrderId: string,
    input: CreateDiscrepancyInput,
    organizationId: string,
    currentUser: { id: string; email: string; role: UserRole },
  ) {
    // Validate WO exists and belongs to org
    const wo = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId, isActive: true },
    });
    if (!wo) throw new NotFoundError('WorkOrder', workOrderId);

    if (['CLOSED'].includes(wo.status)) {
      throw new ValidationError('Cannot add discrepancies to a closed Work Order');
    }

    const code = await this.generateCode(organizationId);

    const discrepancy = await prisma.discrepancy.create({
      data: {
        organizationId,
        workOrderId,
        code,
        title:       input.title,
        description: input.description,
        location:    input.location ?? null,
        ataChapter:  input.ataChapter ?? null,
        foundById:   currentUser.id,
        status:      'OPEN',
      },
      include: this.include,
    });

    await auditLogService.log({
      organizationId,
      entityType:   'Discrepancy',
      entityId:     discrepancy.id,
      action:       'DISCREPANCY_CREATED',
      newValue:     { code, title: input.title, status: 'OPEN', workOrderId },
      userId:       currentUser.id,
      userEmail:    currentUser.email,
      userRole:     currentUser.role,
      workOrderId,
    });

    return discrepancy;
  }

  // ── Update / resolve / defer ───────────────────────────────────────────────
  async update(
    id: string,
    input: UpdateDiscrepancyInput,
    organizationId: string,
    currentUser: { id: string; email: string; role: UserRole },
  ) {
    const existing = await prisma.discrepancy.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundError('Discrepancy', id);

    // When resolving, require resolution notes
    if (input.status === 'RESOLVED' && !input.resolutionNotes?.trim()) {
      throw new ValidationError('Resolution notes are required when resolving a discrepancy');
    }

    // When deferring, require deferral reference
    if (input.status === 'DEFERRED' && !input.deferralRef?.trim()) {
      throw new ValidationError('Deferral reference (MEL/CDL item) is required when deferring a discrepancy');
    }

    const data: Record<string, unknown> = { ...input };

    if (input.status === 'RESOLVED') {
      data.resolvedById = currentUser.id;
      data.resolvedAt   = new Date();
    }

    const updated = await prisma.discrepancy.update({
      where: { id },
      data,
      include: this.include,
    });

    if (input.status && input.status !== existing.status) {
      await auditLogService.log({
        organizationId,
        entityType:    'Discrepancy',
        entityId:      id,
        action:        'DISCREPANCY_STATUS_CHANGED',
        previousValue: { status: existing.status },
        newValue:      { status: input.status },
        userId:        currentUser.id,
        userEmail:     currentUser.email,
        userRole:      currentUser.role,
        workOrderId:   existing.workOrderId,
      });
    }

    return updated;
  }

  // ── List for a WO ──────────────────────────────────────────────────────────
  async list(workOrderId: string, organizationId: string) {
    return prisma.discrepancy.findMany({
      where: { workOrderId, organizationId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────
  async getById(id: string, organizationId: string) {
    const d = await prisma.discrepancy.findFirst({
      where: { id, organizationId },
      include: this.include,
    });
    if (!d) throw new NotFoundError('Discrepancy', id);
    return d;
  }

  private readonly include = {
    foundBy:    { select: { id: true, name: true, role: true } },
    resolvedBy: { select: { id: true, name: true, role: true } },
  };
}

export const discrepancyService = new DiscrepancyService();

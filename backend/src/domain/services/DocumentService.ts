// ─────────────────────────────────────────────────────────────────────────────
//  DocumentService  —  Generates a structured JSON document (OT Summary)
//  This JSON is the canonical "source of truth" for PDF rendering.
//  Use a PDF library (e.g. PDFKit, Puppeteer) to consume this on the frontend.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../infrastructure/database/prisma.client';
import { NotFoundError } from '../../shared/errors/AppError';

export interface OTSummaryDocument {
  meta: {
    documentType:  'WORK_ORDER_SUMMARY';
    generatedAt:   string;
    generatedByUserId: string;
    schemaVersion: '1.0';
  };
  organization: {
    id:        string;
    name:      string;
    legalName: string | null;
    country:   string;
    logoUrl:   string | null;
  };
  workOrder: {
    id:          string;
    number:      string;
    title:       string;
    description: string | null;
    status:      string;
    createdAt:   string;
    closedAt:    string | null;
    plannedStartDate: string | null;
    plannedEndDate:   string | null;
    actualStartDate:  string | null;
    actualEndDate:    string | null;
    notes:       string | null;
  };
  aircraft: {
    registration:      string;
    manufacturer:      string;
    model:             string;
    serialNumber:      string;
    totalFlightHours:  number;
    totalCycles:       number;
    hoursAtOpen:       number | null;
    cyclesAtOpen:      number | null;
    hoursAtClose:      number | null;
    cyclesAtClose:     number | null;
  };
  personnel: {
    createdBy:          SignatureBlock;
    assignedTechnician: SignatureBlock | null;
    inspector:          SignatureBlock | null;
    closedBy:           SignatureBlock | null;
  };
  tasks: TaskLineItem[];
  discrepancies: DiscrepancyLineItem[];
  statistics: {
    totalTasks:      number;
    completedTasks:  number;
    mandatoryTasks:  number;
    openDiscrepancies: number;
    resolvedDiscrepancies: number;
    deferredDiscrepancies: number;
  };
  auditTrail: AuditEntry[];
}

export interface SignatureBlock {
  id:            string;
  name:          string;
  role:          string;
  licenseNumber: string | null;
  signedAt:      string | null;   // ISO timestamp of relevant action
}

export interface TaskLineItem {
  code:           string;
  title:          string;
  isMandatory:    boolean;
  requiresInspection: boolean;
  intervalType:   string;
  referenceType:  string;
  referenceNumber: string | null;
  estimatedManHours: number | null;
  isCompleted:    boolean;
  completedAt:    string | null;
  completedBy:    string | null;
  notes:          string | null;
}

export interface DiscrepancyLineItem {
  code:           string;
  title:          string;
  description:    string;
  location:       string | null;
  ataChapter:     string | null;
  status:         string;
  foundBy:        string;
  foundAt:        string;
  resolvedBy:     string | null;
  resolvedAt:     string | null;
  resolutionNotes: string | null;
  deferralRef:    string | null;
  deferralExpiresAt: string | null;
}

export interface AuditEntry {
  timestamp:  string;
  action:     string;
  userEmail:  string;
  userRole:   string;
  detail:     Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────

export class DocumentService {

  async generateOTSummary(
    workOrderId: string,
    organizationId: string,
    generatedByUserId: string,
  ): Promise<OTSummaryDocument> {

    const [wo, org, auditLogs] = await Promise.all([
      prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId, isActive: true },
        include: {
          aircraft:           true,
          createdBy:          true,
          assignedTechnician: true,
          inspector:          true,
          closedBy:           true,
          tasks: {
            include: {
              task:        true,
              completedBy: true,
            },
            orderBy: [{ task: { isMandatory: 'desc' } }, { task: { code: 'asc' } }],
          },
          discrepancies: {
            include: { foundBy: true, resolvedBy: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.auditLog.findMany({
        where: { workOrderId, organizationId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!wo)  throw new NotFoundError('WorkOrder', workOrderId);
    if (!org) throw new NotFoundError('Organization', organizationId);

    const toSig = (u: { id: string; name: string; role: string; licenseNumber?: string | null } | null, signedAt: string | null): SignatureBlock | null => {
      if (!u) return null;
      return { id: u.id, name: u.name, role: u.role, licenseNumber: u.licenseNumber ?? null, signedAt };
    };

    const tasks: TaskLineItem[] = wo.tasks.map(wot => ({
      code:              wot.task.code,
      title:             wot.task.title,
      isMandatory:       wot.task.isMandatory,
      requiresInspection: wot.task.requiresInspection,
      intervalType:      wot.task.intervalType,
      referenceType:     wot.task.referenceType,
      referenceNumber:   wot.task.referenceNumber,
      estimatedManHours: wot.task.estimatedManHours ? Number(wot.task.estimatedManHours) : null,
      isCompleted:       wot.isCompleted,
      completedAt:       wot.completedAt?.toISOString() ?? null,
      completedBy:       wot.completedBy?.name ?? null,
      notes:             wot.notes,
    }));

    const discrepancies: DiscrepancyLineItem[] = wo.discrepancies.map(d => ({
      code:            d.code,
      title:           d.title,
      description:     d.description,
      location:        d.location,
      ataChapter:      d.ataChapter,
      status:          d.status,
      foundBy:         d.foundBy.name,
      foundAt:         d.createdAt.toISOString(),
      resolvedBy:      d.resolvedBy?.name ?? null,
      resolvedAt:      d.resolvedAt?.toISOString() ?? null,
      resolutionNotes: d.resolutionNotes,
      deferralRef:     d.deferralRef,
      deferralExpiresAt: d.deferralExpiresAt?.toISOString() ?? null,
    }));

    const auditTrail: AuditEntry[] = auditLogs.map(log => ({
      timestamp: log.createdAt.toISOString(),
      action:    log.action,
      userEmail: log.userEmail,
      userRole:  log.userRole,
      detail:    (log.newValue as Record<string, unknown>) ?? null,
    }));

    const stats = {
      totalTasks:            tasks.length,
      completedTasks:        tasks.filter(t => t.isCompleted).length,
      mandatoryTasks:        tasks.filter(t => t.isMandatory).length,
      openDiscrepancies:     discrepancies.filter(d => d.status === 'OPEN').length,
      resolvedDiscrepancies: discrepancies.filter(d => d.status === 'RESOLVED').length,
      deferredDiscrepancies: discrepancies.filter(d => d.status === 'DEFERRED').length,
    };

    const doc: OTSummaryDocument = {
      meta: {
        documentType:      'WORK_ORDER_SUMMARY',
        generatedAt:       new Date().toISOString(),
        generatedByUserId,
        schemaVersion:     '1.0',
      },
      organization: {
        id:        org.id,
        name:      org.name,
        legalName: org.legalName,
        country:   org.country,
        logoUrl:   null,   // reserved for future attachment upload feature
      },
      workOrder: {
        id:          wo.id,
        number:      wo.number,
        title:       wo.title,
        description: wo.description,
        status:      wo.status,
        createdAt:   wo.createdAt.toISOString(),
        closedAt:    wo.closedAt?.toISOString() ?? null,
        plannedStartDate: wo.plannedStartDate?.toISOString() ?? null,
        plannedEndDate:   wo.plannedEndDate?.toISOString()   ?? null,
        actualStartDate:  wo.actualStartDate?.toISOString()  ?? null,
        actualEndDate:    wo.actualEndDate?.toISOString()    ?? null,
        notes: wo.notes,
      },
      aircraft: {
        registration:     wo.aircraft.registration,
        manufacturer:     wo.aircraft.manufacturer,
        model:            wo.aircraft.model,
        serialNumber:     wo.aircraft.serialNumber,
        totalFlightHours: Number(wo.aircraft.totalFlightHours),
        totalCycles:      wo.aircraft.totalCycles,
        hoursAtOpen:  wo.aircraftHoursAtOpen  ? Number(wo.aircraftHoursAtOpen)  : null,
        cyclesAtOpen: wo.aircraftCyclesAtOpen ?? null,
        hoursAtClose: wo.aircraftHoursAtClose ? Number(wo.aircraftHoursAtClose) : null,
        cyclesAtClose: wo.aircraftCyclesAtClose ?? null,
      },
      personnel: {
        createdBy:          toSig(wo.createdBy,           wo.createdAt.toISOString())!,
        assignedTechnician: toSig(wo.assignedTechnician,  wo.actualStartDate?.toISOString() ?? null),
        inspector:          toSig(wo.inspector,           null),
        closedBy:           toSig(wo.closedBy,            wo.closedAt?.toISOString() ?? null),
      },
      tasks,
      discrepancies,
      statistics: stats,
      auditTrail,
    };

    return doc;
  }
}

export const documentService = new DocumentService();

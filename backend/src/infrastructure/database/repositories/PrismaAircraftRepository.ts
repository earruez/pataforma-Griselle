import { Aircraft, CreateAircraftInput, UpdateAircraftInput, AircraftStatus } from '../../../domain/entities/Aircraft';
import { IAircraftRepository, MaintenancePlanItem, PlanItemStatus } from '../../../domain/repositories/IAircraftRepository';
import { PaginatedResult, PaginationOptions } from '../../../domain/repositories/shared';
import { prisma } from '../prisma.client';

export class PrismaAircraftRepository implements IAircraftRepository {
  async findById(id: string, organizationId: string): Promise<Aircraft | null> {
    const row = await prisma.aircraft.findFirst({ where: { id, organizationId } });
    return row ? this.toEntity(row) : null;
  }

  async findByRegistration(registration: string, organizationId: string): Promise<Aircraft | null> {
    const row = await prisma.aircraft.findFirst({ where: { registration, organizationId } });
    return row ? this.toEntity(row) : null;
  }

  async findAll(
    organizationId: string,
    options: PaginationOptions = { page: 1, limit: 20 },
    statusFilter?: AircraftStatus,
  ): Promise<PaginatedResult<Aircraft>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;
    const where = { organizationId, ...(statusFilter && { status: statusFilter }) };

    const [data, total] = await prisma.$transaction([
      prisma.aircraft.findMany({ where, skip, take: limit, orderBy: { registration: 'asc' } }),
      prisma.aircraft.count({ where }),
    ]);

    return { data: data.map(this.toEntity), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(input: CreateAircraftInput): Promise<Aircraft> {
    const row = await prisma.aircraft.create({ data: input });
    return this.toEntity(row);
  }

  async update(id: string, organizationId: string, input: UpdateAircraftInput): Promise<Aircraft> {
    const row = await prisma.aircraft.update({
      where: { id, organizationId } as never,
      data: input,
    });
    return this.toEntity(row);
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await prisma.aircraft.delete({ where: { id, organizationId } as never });
  }

  async getMaintenancePlan(aircraftId: string, organizationId: string): Promise<MaintenancePlanItem[]> {
    const aircraft = await prisma.aircraft.findFirst({ where: { id: aircraftId, organizationId } });
    const now = new Date();
    const currentHours = aircraft ? Number(aircraft.totalFlightHours) : 0;
    const currentCycles = aircraft ? aircraft.totalCycles : 0;

    // All tasks assigned to this aircraft with their latest compliance
    const links = await prisma.aircraftTask.findMany({
      where: { aircraftId, isActive: true },
      include: {
        task: true,
        aircraft: { select: { totalFlightHours: true, totalCycles: true } },
      },
    });

    // Get latest compliance per task in one query
    const taskIds = links.map(l => l.taskId);
    const latestCompliances = taskIds.length > 0
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
          SELECT DISTINCT ON ("taskId") *
          FROM compliances
          WHERE "aircraftId" = '${aircraftId}'
            AND "organizationId" = '${organizationId}'
            AND "taskId" = ANY(ARRAY[${taskIds.map(id => `'${id}'`).join(',')}]::uuid[])
          ORDER BY "taskId", "performedAt" DESC
        `)
      : [];

    const compByTask = new Map<string, Record<string, unknown>>();
    for (const c of latestCompliances) compByTask.set(c.taskId as string, c);

    return links.map(({ task }) => {
      const comp = compByTask.get(task.id);
      const nextDueHours  = comp?.nextDueHours  != null ? Number(comp.nextDueHours)  : null;
      const nextDueCycles = comp?.nextDueCycles != null ? Number(comp.nextDueCycles) : null;
      const nextDueDate   = comp?.nextDueDate   != null ? new Date(comp.nextDueDate as string) : null;

      let status: PlanItemStatus = 'NEVER_PERFORMED';
      if (comp) {
        const overdueH  = nextDueHours  != null && currentHours  > nextDueHours;
        const overdueC  = nextDueCycles != null && currentCycles > nextDueCycles;
        const overdueD  = nextDueDate   != null && nextDueDate   < now;
        const dueSoonH  = nextDueHours  != null && (nextDueHours  - currentHours)  <= 50;
        const dueSoonC  = nextDueCycles != null && (nextDueCycles - currentCycles) <= 25;
        const dueSoonD  = nextDueDate   != null && (nextDueDate.getTime() - now.getTime()) <= 30 * 864e5;
        if (overdueH || overdueC || overdueD)       status = 'OVERDUE';
        else if (dueSoonH || dueSoonC || dueSoonD)  status = 'DUE_SOON';
        else                                         status = 'OK';
      }

      return {
        taskId:              task.id,
        taskCode:            task.code,
        taskTitle:           task.title,
        intervalType:        task.intervalType,
        intervalHours:       task.intervalHours != null ? Number(task.intervalHours) : null,
        intervalCycles:      task.intervalCycles,
        intervalCalendarDays:task.intervalCalendarDays,
        referenceType:       task.referenceType,
        referenceNumber:     task.referenceNumber,
        isMandatory:         task.isMandatory,
        estimatedManHours:   task.estimatedManHours != null ? Number(task.estimatedManHours) : null,
        lastPerformedAt:     comp?.performedAt != null ? new Date(comp.performedAt as string) : null,
        lastWorkOrder:       (comp?.workOrderNumber as string | null) ?? null,
        lastHoursAtCompliance: comp?.aircraftHoursAtCompliance != null ? Number(comp.aircraftHoursAtCompliance) : null,
        nextDueHours,
        nextDueCycles,
        nextDueDate,
        hoursRemaining:  nextDueHours  != null ? Math.round(nextDueHours  - currentHours)  : null,
        cyclesRemaining: nextDueCycles != null ? Math.round(nextDueCycles - currentCycles) : null,
        daysRemaining:   nextDueDate   != null ? Math.ceil((nextDueDate.getTime() - now.getTime()) / 864e5) : null,
        status,
      };
    }).sort((a, b) => {
      const order = { OVERDUE: 0, DUE_SOON: 1, NEVER_PERFORMED: 2, OK: 3 };
      return order[a.status] - order[b.status];
    });
  }

  private toEntity(r: Record<string, unknown>): Aircraft {
    return {
      id: r.id as string,
      organizationId: r.organizationId as string,
      registration: r.registration as string,
      model: r.model as string,
      manufacturer: r.manufacturer as string,
      serialNumber: r.serialNumber as string,
      engineCount: r.engineCount as number,
      engineModel: r.engineModel as string | null,
      totalFlightHours: Number(r.totalFlightHours),
      totalCycles: r.totalCycles as number,
      status: r.status as Aircraft['status'],
      manufactureDate: r.manufactureDate as Date | null,
      registrationDate: r.registrationDate as Date | null,
      coaExpiryDate: r.coaExpiryDate as Date | null,
      insuranceExpiryDate: r.insuranceExpiryDate as Date | null,
      isActive: r.isActive as boolean,
      createdAt: r.createdAt as Date,
      updatedAt: r.updatedAt as Date,
    };
  }
}

import { Component, CreateComponentInput } from '../../../domain/entities/Component';
import { IComponentRepository } from '../../../domain/repositories/IComponentRepository';
import { PaginatedResult, PaginationOptions } from '../../../domain/repositories/shared';
import { prisma } from '../prisma.client';

export class PrismaComponentRepository implements IComponentRepository {
  async findById(id: string, organizationId: string): Promise<Component | null> {
    const row = await prisma.component.findFirst({ where: { id, organizationId } });
    return row ? this.toEntity(row) : null;
  }

  async findBySerialNumber(serialNumber: string, organizationId: string): Promise<Component | null> {
    const row = await prisma.component.findFirst({ where: { serialNumber, organizationId } });
    return row ? this.toEntity(row) : null;
  }

  async findByAircraft(aircraftId: string, organizationId: string): Promise<Component[]> {
    const rows = await prisma.component.findMany({
      where: { aircraftId, organizationId },
      orderBy: { partNumber: 'asc' },
    });
    return rows.map(this.toEntity);
  }

  async findAll(
    organizationId: string,
    options: PaginationOptions = { page: 1, limit: 20 },
  ): Promise<PaginatedResult<Component>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;
    const where = { organizationId };

    const [data, total] = await prisma.$transaction([
      prisma.component.findMany({ where, skip, take: limit, orderBy: { partNumber: 'asc' } }),
      prisma.component.count({ where }),
    ]);

    return { data: data.map(this.toEntity), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(input: CreateComponentInput): Promise<Component> {
    const row = await prisma.component.create({ data: input });
    return this.toEntity(row);
  }

  async update(
    id: string,
    organizationId: string,
    input: Parameters<IComponentRepository['update']>[2],
  ): Promise<Component> {
    const row = await prisma.component.update({
      where: { id, organizationId } as never,
      data: input,
    });
    return this.toEntity(row);
  }

  private toEntity(r: Record<string, unknown>): Component {
    return {
      id: r.id as string,
      organizationId: r.organizationId as string,
      aircraftId: r.aircraftId as string | null,
      partNumber: r.partNumber as string,
      serialNumber: r.serialNumber as string,
      description: r.description as string,
      manufacturer: r.manufacturer as string,
      position: r.position as string | null,
      totalHoursSinceNew: Number(r.totalHoursSinceNew),
      totalCyclesSinceNew: r.totalCyclesSinceNew as number,
      hoursSinceOverhaul: Number(r.hoursSinceOverhaul),
      cyclesSinceOverhaul: r.cyclesSinceOverhaul as number,
      tboHours: r.tboHours != null ? Number(r.tboHours) : null,
      tboCycles: r.tboCycles as number | null,
      tboCalendarDays: r.tboCalendarDays as number | null,
      lifeLimitHours: r.lifeLimitHours != null ? Number(r.lifeLimitHours) : null,
      lifeLimitCycles: r.lifeLimitCycles as number | null,
      installationDate: r.installationDate as Date | null,
      installationAircraftHours: r.installationAircraftHours != null ? Number(r.installationAircraftHours) : null,
      installationAircraftCycles: r.installationAircraftCycles as number | null,
      status: r.status as Component['status'],
      isActive: r.isActive as boolean,
      notes: r.notes as string | null,
      createdAt: r.createdAt as Date,
      updatedAt: r.updatedAt as Date,
    };
  }
}

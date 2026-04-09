import { Aircraft, CreateAircraftInput, UpdateAircraftInput, AircraftStatus } from '../../../domain/entities/Aircraft';
import { IAircraftRepository } from '../../../domain/repositories/IAircraftRepository';
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

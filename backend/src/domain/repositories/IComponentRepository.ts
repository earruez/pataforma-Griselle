import { Component, CreateComponentInput } from '../entities/Component';
import { PaginatedResult, PaginationOptions } from './shared';

export interface IComponentRepository {
  findById(id: string, organizationId: string): Promise<Component | null>;
  findBySerialNumber(serialNumber: string, organizationId: string): Promise<Component | null>;
  findByAircraft(aircraftId: string, organizationId: string): Promise<Component[]>;
  findAll(organizationId: string, options?: PaginationOptions): Promise<PaginatedResult<Component>>;
  create(input: CreateComponentInput): Promise<Component>;
  update(
    id: string,
    organizationId: string,
    input: Partial<
      Pick<
        Component,
        | 'aircraftId'
        | 'position'
        | 'status'
        | 'totalHoursSinceNew'
        | 'totalCyclesSinceNew'
        | 'hoursSinceOverhaul'
        | 'cyclesSinceOverhaul'
        | 'installationDate'
        | 'installationAircraftHours'
        | 'installationAircraftCycles'
        | 'notes'
      >
    >,
  ): Promise<Component>;
}

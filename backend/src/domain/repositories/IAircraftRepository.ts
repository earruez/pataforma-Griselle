import { Aircraft, AircraftStatus, CreateAircraftInput, UpdateAircraftInput } from '../entities/Aircraft';
import { PaginatedResult, PaginationOptions } from './shared';

export interface IAircraftRepository {
  findById(id: string, organizationId: string): Promise<Aircraft | null>;
  findByRegistration(registration: string, organizationId: string): Promise<Aircraft | null>;
  findAll(
    organizationId: string,
    options?: PaginationOptions,
    statusFilter?: AircraftStatus,
  ): Promise<PaginatedResult<Aircraft>>;
  create(input: CreateAircraftInput): Promise<Aircraft>;
  update(id: string, organizationId: string, input: UpdateAircraftInput): Promise<Aircraft>;
  delete(id: string, organizationId: string): Promise<void>;
}
